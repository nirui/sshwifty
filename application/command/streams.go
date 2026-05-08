// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2025 Ni Rui <ranqus@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package command

import (
	"errors"
	"io"

	"github.com/Snuffy2/sshwifty/application/log"
	"github.com/Snuffy2/sshwifty/application/rw"
)

// ErrStreamsInvalidStreamID is returned when a stream ID exceeds HeaderMaxData.
// ErrStreamsStreamOperateInactiveStream is returned when a tick is attempted on
// a stream that has not been booted or has already been released.
// ErrStreamsStreamClosingInactiveStream is returned when close is called on a
// stream with no active FSM.
// ErrStreamsStreamReleasingInactiveStream is returned when release is called on
// a stream with no active FSM.
var (
	ErrStreamsInvalidStreamID = errors.New(
		"stream ID is invalid")

	ErrStreamsStreamOperateInactiveStream = errors.New(
		"specified stream was inactive for operation")

	ErrStreamsStreamClosingInactiveStream = errors.New(
		"closing an inactive stream is not allowed")

	ErrStreamsStreamReleasingInactiveStream = errors.New(
		"releasing an inactive stream is not allowed")
)

// StreamError is a 16-bit error code sent to the client in stream initial
// headers to indicate why a command could not be started.
type StreamError uint16

// StreamErrorCommandUndefined indicates the requested command ID is not
// registered. StreamErrorCommandFailedToBootup indicates the command's Bootup
// returned a non-success FSMError.
const (
	StreamErrorCommandUndefined      StreamError = 0x01
	StreamErrorCommandFailedToBootup StreamError = 0x02
)

// StreamHeader is the two-byte sub-header that precedes each data frame within
// an open stream. The upper 3 bits encode a marker byte and the lower 13 bits
// encode the payload length.
type StreamHeader [2]byte

// StreamHeaderMaxLength is the maximum payload length encodable in a
// StreamHeader (13 bits). StreamHeaderMaxMarker is the highest marker value
// (3 bits). streamHeaderLengthFirstByteCutter masks the length bits from the
// first byte.
const (
	StreamHeaderMaxLength = 0x1fff
	StreamHeaderMaxMarker = 0x07

	streamHeaderLengthFirstByteCutter = 0x1f
)

// Marker returns the header marker data
func (s StreamHeader) Marker() byte {
	return s[0] >> 5
}

// Length returns the data length of the stream
func (s StreamHeader) Length() uint16 {
	r := uint16(0)

	r |= uint16(s[0] & streamHeaderLengthFirstByteCutter)
	r <<= 8
	r |= uint16(s[1])

	return r
}

// Set sets the stream header
func (s *StreamHeader) Set(marker byte, n uint16) {
	if marker > StreamHeaderMaxMarker {
		panic("marker must not be greater than 0x07")
	}

	if n > StreamHeaderMaxLength {
		panic("n must not be greater than 0x1fff")
	}

	s[0] = (marker << 5) | byte((n>>8)&streamHeaderLengthFirstByteCutter)
	s[1] = byte(n)
}

// streamInitialHeader is the two-byte header sent when a stream slot is first
// opened. It encodes the command ID (upper 4 bits of byte 0), a success flag
// (bit 3 of byte 0), and an 11-bit data/error field, but no stream-level
// marker unlike StreamHeader.
type streamInitialHeader StreamHeader

// command extracts the 4-bit command ID from the high nibble of the first byte.
func (s streamInitialHeader) command() byte {
	return s[0] >> 4
}

// data extracts the 11-bit error/data field from the initial header.
func (s streamInitialHeader) data() uint16 {
	r := uint16(0)

	r |= uint16(s[0] & 0x07) // 0000 0111
	r <<= 8
	r |= uint16(s[1])

	return r
}

// success returns true when bit 3 of byte 0 is set, indicating the command
// started successfully.
func (s streamInitialHeader) success() bool {
	return (s[0] & 0x08) != 0
}

// set encodes commandID (0–0x0f), data (0–0x07ff), and the success flag into
// the two-byte header. It panics if either value exceeds its maximum.
func (s *streamInitialHeader) set(commandID byte, data uint16, success bool) {
	if commandID > 0x0f {
		panic("Command ID must not greater than 0x0f")
	}

	if data > 0x07ff {
		panic("Data must not greater than 0x07ff")
	}

	dd := data & 0x07ff

	if success {
		dd |= 0x0800
	}

	(*s)[0] = 0
	(*s)[0] |= commandID << 4
	(*s)[0] |= byte(dd >> 8)
	(*s)[1] = 0
	(*s)[1] |= byte(dd)
}

// signal serialises the header and writes it as a framed signal through w
// using the given packet Header and scratch buffer buf.
func (s *streamInitialHeader) signal(
	w *handlerSender,
	hd Header,
	buf []byte,
) error {
	return w.signal(hd, (*s)[:], buf)
}

// StreamInitialSignalSender encapsulates the state needed to send the initial
// response header for a newly opened stream, signalling either success or a
// specific StreamError to the client.
type StreamInitialSignalSender struct {
	// w is the locked writer used to transmit the signal.
	w *handlerSender
	// hd is the packet-level Header (stream ID + type).
	hd Header
	// cmdID is the command ID being reported.
	cmdID byte
	// buf is the scratch buffer used to serialise the header.
	buf []byte
}

// Signal send signal
func (s *StreamInitialSignalSender) Signal(
	errno StreamError, success bool) error {
	shd := streamInitialHeader{}
	shd.set(s.cmdID, uint16(errno), success)

	return shd.signal(s.w, s.hd, s.buf)
}

// StreamResponder provides the write surface available to a running FSMMachine.
// It wraps the underlying sender with the stream's packet Header so that all
// frames are automatically tagged with the correct stream ID.
type StreamResponder struct {
	// w is the rate-limited, lock-guarded sender.
	w streamHandlerSender
	// h is the packet Header that identifies this stream.
	h Header
}

// newStreamResponder creates a StreamResponder for the given stream Header,
// delegating writes to the provided streamHandlerSender.
func newStreamResponder(w streamHandlerSender, h Header) StreamResponder {
	return StreamResponder{
		w: w,
		h: h,
	}
}

// write encodes a single payload segment b with marker mk into buf and writes
// it to the wire. It caps the segment at both the buffer size and
// StreamHeaderMaxLength. It returns the number of bytes of b consumed.
func (w StreamResponder) write(mk byte, b []byte, buf []byte) (int, error) {
	bufLen := len(buf)
	bLen := len(b)

	if bLen > bufLen {
		bLen = bufLen
	}

	if bLen > StreamHeaderMaxLength {
		bLen = StreamHeaderMaxLength
	}

	sHeaderStream := StreamHeader{}
	sHeaderStream.Set(mk, uint16(bLen))

	toWrite := copy(buf[3:], b)
	buf[0] = byte(w.h)
	buf[1] = sHeaderStream[0]
	buf[2] = sHeaderStream[1]

	_, wErr := w.w.Write(buf[:toWrite+3])

	if wErr != nil {
		return 0, wErr
	}

	return len(b), wErr
}

// HeaderSize returns the size of header
func (w StreamResponder) HeaderSize() int {
	return 3
}

// Send sends data. Data will be automatically segmentated if it's too long to
// fit into one data package or buffer space
func (w StreamResponder) Send(marker byte, data []byte, buf []byte) error {
	if len(buf) <= w.HeaderSize() {
		panic("The length of data buffer must be greater than 3")
	}

	dataLen := len(data)
	start := 0

	for {
		wLen, wErr := w.write(marker, data[start:], buf)

		start += wLen

		if wErr != nil {
			return wErr
		}

		if start < dataLen {
			continue
		}

		return nil
	}
}

// SendManual sends the data without automatical segmentation. It will construct
// the data package directly using the given `data` buffer, that is, the first
// n bytes of the given `data` will be used to setup headers. It is the caller's
//
//	responsibility to leave n bytes of space so no meaningful data will be over
//
// written. The number n can be acquired by calling .HeaderSize() method.
func (w StreamResponder) SendManual(marker byte, data []byte) error {
	dataLen := len(data)

	if dataLen < w.HeaderSize() {
		panic("The length of data buffer must be greater than the " +
			"w.HeaderSize()")
	}

	if dataLen > StreamHeaderMaxLength {
		panic("Data length must not greater than StreamHeaderMaxLength")
	}

	sHeaderStream := StreamHeader{}
	sHeaderStream.Set(marker, uint16(dataLen-w.HeaderSize()))

	data[0] = byte(w.h)
	data[1] = sHeaderStream[0]
	data[2] = sHeaderStream[1]

	_, wErr := w.w.Write(data)

	return wErr
}

// Signal sends a signal
func (w StreamResponder) Signal(signal Header) error {
	if !signal.IsStreamControl() {
		panic("Only stream control signal is allowed")
	}

	sHeader := signal
	sHeader.Set(w.h.Data())

	_, wErr := w.w.Write([]byte{byte(sHeader)})

	return wErr
}

// stream represents a single multiplexed stream slot. It wraps an FSM and
// tracks whether a close signal has already been sent, preventing double-close
// during shutdown.
type stream struct {
	// f is the finite-state machine driving this stream's command.
	f FSM
	// closed is true once the Close signal has been sent on this stream.
	closed bool
}

// streams is the fixed-size array of all stream slots indexed by stream ID.
// The size equals HeaderMaxData+1 (64 slots), matching the 6-bit stream ID
// field in the packet header.
type streams [HeaderMaxData + 1]stream

// newStream creates an empty, unclosed stream slot with no active FSM.
func newStream() stream {
	return stream{
		f:      emptyFSM(),
		closed: false,
	}
}

// newStreams initialises all stream slots to the empty state.
func newStreams() streams {
	s := streams{}

	for i := range s {
		s[i] = newStream()
	}

	return s
}

// get returns a pointer to the stream slot for the given id. It returns
// ErrStreamsInvalidStreamID if id exceeds HeaderMaxData.
func (c *streams) get(id byte) (*stream, error) {
	if id > HeaderMaxData {
		return nil, ErrStreamsInvalidStreamID
	}

	return &(*c)[id], nil
}

// shutdown iterates all slots and closes then releases any that are still
// running, ensuring every active command receives a close notification before
// the handler exits.
func (c *streams) shutdown() {
	cc := *c

	for i := range cc {
		if !cc[i].running() {
			continue
		}

		if !cc[i].closed {
			cc[i].close()
		}

		cc[i].release()
	}
}

// running reports whether the stream has an active FSM, meaning it has been
// booted and not yet released.
func (c *stream) running() bool {
	return c.f.running()
}

// reinit reads a streamInitialHeader from r to determine the command ID and
// initial payload, instantiates the command's FSM, boots it, and sends the
// result back to the client. On success the stream's FSM is set and the slot
// is marked as open. Errors from unknown commands or failed bootups are sent
// as stream-level error signals rather than propagating as Go errors.
func (c *stream) reinit(
	h Header,
	r *rw.FetchReader,
	w streamHandlerSender,
	l log.Logger,
	hooks Hooks,
	cc *Commands,
	cfg Configuration,
	bufferPool *BufferPool,
	b []byte,
) error {
	hd := streamInitialHeader{}

	_, rErr := io.ReadFull(r, hd[:])

	if rErr != nil {
		return rErr
	}

	l = l.TitledContext("Command (%d)", hd.command())

	ccc, cccErr := cc.Run(
		hd.command(), l, hooks, newStreamResponder(w, h), cfg, bufferPool)

	if cccErr != nil {
		hd.set(0, uint16(StreamErrorCommandUndefined), false)
		hd.signal(w.handlerSender, h, b)

		l.Warning("Trying to execute an unknown command %d", hd.command())

		return nil
	}

	signaller := StreamInitialSignalSender{
		w:     w.handlerSender,
		hd:    h,
		cmdID: hd.command(),
		buf:   b,
	}

	rr := rw.NewLimitedReader(r, int(hd.data()))
	defer rr.Ditch(b)

	bootErr := ccc.bootup(&rr, b)

	if !bootErr.Succeed() {
		l.Warning("Unable to start command %d due to error: %s",
			hd.command(), bootErr.Error())

		signaller.Signal(bootErr.code, false)

		return nil
	}

	c.f = ccc
	c.closed = false

	sErr := signaller.Signal(bootErr.code, true)

	if sErr != nil {
		return sErr
	}

	l.Debug("Started")

	return nil
}

// tick reads a StreamHeader from r, wraps the remaining bytes in a
// LimitedReader, and forwards the frame to the running FSM. It returns
// ErrStreamsStreamOperateInactiveStream if the FSM is not running.
func (c *stream) tick(
	h Header,
	r *rw.FetchReader,
	b []byte,
) error {
	if !c.f.running() {
		return ErrStreamsStreamOperateInactiveStream
	}

	hd := StreamHeader{}

	_, rErr := io.ReadFull(r, hd[:])

	if rErr != nil {
		return rErr
	}

	rr := rw.NewLimitedReader(r, int(hd.Length()))
	defer rr.Ditch(b)

	return c.f.tick(&rr, hd, b)
}

// close marks the stream as closed and delegates to the underlying FSM's close
// method. It returns ErrStreamsStreamClosingInactiveStream if the FSM is not
// running.
func (c *stream) close() error {
	if !c.f.running() {
		return ErrStreamsStreamClosingInactiveStream
	}

	// Set a marker so streams.shutdown won't call it. Stream can call it
	// however they want, though that may cause error that disconnects.
	c.closed = true

	return c.f.close()
}

// release frees the stream's FSM resources. It returns
// ErrStreamsStreamReleasingInactiveStream if the FSM is not running.
func (c *stream) release() error {
	if !c.f.running() {
		return ErrStreamsStreamReleasingInactiveStream
	}

	return c.f.release()
}
