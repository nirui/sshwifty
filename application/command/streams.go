// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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

	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrStreamsInvalidStreamID = errors.New(
		"Stream ID is invalid")

	ErrStreamsStreamOperateInactiveStream = errors.New(
		"Specified stream was inactive for operation")

	ErrStreamsStreamClosingInactiveStream = errors.New(
		"Closing an inactive stream is not allowed")

	ErrStreamsStreamReleasingInactiveStream = errors.New(
		"Releasing an inactive stream is not allowed")
)

// StreamError Stream Error signal
type StreamError uint16

// Error signals
const (
	StreamErrorCommandUndefined      StreamError = 0x01
	StreamErrorCommandFailedToBootup StreamError = 0x02
)

// StreamHeader contains data of the stream header
type StreamHeader [2]byte

// Stream header consts
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

// streamInitialHeader contains header data of the first stream after stream
// reset.
// Unlike StreamHeader, streamInitialHeader carries no extra data
type streamInitialHeader StreamHeader

// command returns command ID of the stream
func (s streamInitialHeader) command() byte {
	return s[0] >> 4
}

// length returns the data of the stream header
func (s streamInitialHeader) data() uint16 {
	r := uint16(0)

	r |= uint16(s[0] & 0x07) // 0000 0111
	r <<= 8
	r |= uint16(s[1])

	return r
}

// success returns whether or not the command is representing a success
func (s streamInitialHeader) success() bool {
	return (s[0] & 0x08) != 0
}

// set sets header values
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

// send sends current stream header as signal
func (s *streamInitialHeader) signal(
	w *handlerSender,
	hd Header,
	buf []byte,
) error {
	return w.signal(hd, (*s)[:], buf)
}

// StreamInitialSignalSender sends stream initial signal
type StreamInitialSignalSender struct {
	w     *handlerSender
	hd    Header
	cmdID byte
	buf   []byte
}

// Signal send signal
func (s *StreamInitialSignalSender) Signal(
	errno StreamError, success bool) error {
	shd := streamInitialHeader{}
	shd.set(s.cmdID, uint16(errno), success)

	return shd.signal(s.w, s.hd, s.buf)
}

// StreamResponder sends data through stream
type StreamResponder struct {
	w streamHandlerSender
	h Header
}

// newStreamResponder creates a new StreamResponder
func newStreamResponder(w streamHandlerSender, h Header) StreamResponder {
	return StreamResponder{
		w: w,
		h: h,
	}
}

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
//  responsibility to leave n bytes of space so no meaningful data will be over
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

type stream struct {
	f      FSM
	closed bool
}

type streams [HeaderMaxData + 1]stream

func newStream() stream {
	return stream{
		f:      emptyFSM(),
		closed: false,
	}
}

func newStreams() streams {
	s := streams{}

	for i := range s {
		s[i] = newStream()
	}

	return s
}

func (c *streams) get(id byte) (*stream, error) {
	if id > HeaderMaxData {
		return nil, ErrStreamsInvalidStreamID
	}

	return &(*c)[id], nil
}

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

func (c *stream) running() bool {
	return c.f.running()
}

func (c *stream) reinit(
	h Header,
	r *rw.FetchReader,
	w streamHandlerSender,
	l log.Logger,
	cc *Commands,
	cfg Configuration,
	b []byte,
) error {
	hd := streamInitialHeader{}

	_, rErr := io.ReadFull(r, hd[:])

	if rErr != nil {
		return rErr
	}

	l = l.Context("Command (%d)", hd.command())

	ccc, cccErr := cc.Run(
		hd.command(), l, newStreamResponder(w, h), cfg)

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

func (c *stream) close() error {
	if !c.f.running() {
		return ErrStreamsStreamClosingInactiveStream
	}

	// Set a marker so streams.shutdown won't call it. Stream can call it
	// however they want, though that may cause error that disconnects.
	c.closed = true

	return c.f.close()
}

func (c *stream) release() error {
	if !c.f.running() {
		return ErrStreamsStreamReleasingInactiveStream
	}

	return c.f.release()
}
