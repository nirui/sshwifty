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
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/Snuffy2/sshwifty/application/log"
	"github.com/Snuffy2/sshwifty/application/rw"
)

// ErrHandlerUnknownHeaderType is returned by Handle when a frame arrives with
// a header type that does not match any of the four known types.
// ErrHandlerControlMessageTooLong is returned when the declared control payload
// length exceeds the read buffer.
// ErrHandlerInvalidControlMessage is returned when a control frame carries zero
// bytes of payload.
var (
	ErrHandlerUnknownHeaderType = errors.New(
		"unknown command header type")

	ErrHandlerControlMessageTooLong = errors.New(
		"control message was too long")

	ErrHandlerInvalidControlMessage = errors.New(
		"invalid control message")
)

// HandlerCancelSignal is a channel that, when closed or written to, signals
// the handler to abort its processing loop.
type HandlerCancelSignal chan struct{}

// handlerReadBufLen is the size of the per-handler read scratch buffer. It
// accommodates the maximum stream data payload plus a one-byte header and two
// bytes for stream sub-headers.
const (
	handlerReadBufLen = HeaderMaxData + 3 // (3 = 1 Header, 2 Etc)
)

// handlerBuf is the fixed-size scratch buffer embedded in each Handler.
type handlerBuf [handlerReadBufLen]byte

// handlerSender serialises writes to the underlying io.Writer while supporting
// pause/resume flow control. All writes are protected by lock; callers that
// hold lock directly may bypass the wait via writer.
type handlerSender struct {
	// writer is the underlying transport output.
	writer io.Writer
	// lock guards writer access and is shared with the signal condition.
	lock *sync.Mutex
	// needWait is true while sending is paused.
	needWait bool
	// sign is broadcast when needWait transitions from true to false.
	sign *sync.Cond
}

// pause suspends all Write calls on this sender until resume is called.
func (h *handlerSender) pause() {
	h.lock.Lock()
	defer h.lock.Unlock()

	h.needWait = true
}

// resume unblocks any Write calls that are waiting due to a prior pause.
func (h *handlerSender) resume() {
	h.lock.Lock()
	defer h.lock.Unlock()

	h.needWait = false
	h.sign.Broadcast()
}

// signal serialises hd and d into buf and writes the resulting frame. It panics
// if buf is too small to hold the header byte plus all of d.
func (h *handlerSender) signal(hd Header, d []byte, buf []byte) error {
	bufLen := len(buf)
	dLen := len(d)

	if bufLen < dLen+1 {
		panic(fmt.Sprintf("Sending signal %s:%d requires %d bytes of buffer, "+
			"but only %d bytes is available", hd, d, dLen+1, bufLen))
	}

	buf[0] = byte(hd)

	wLen := copy(buf[1:], d) + 1

	_, wErr := h.Write(buf[:wLen])

	return wErr
}

// Write implements io.Writer. It blocks while the sender is paused and then
// delegates to the underlying writer.
func (h *handlerSender) Write(b []byte) (int, error) {
	h.lock.Lock()
	defer h.lock.Unlock()

	for h.needWait {
		h.sign.Wait()
	}

	return h.writer.Write(b)
}

// streamHandlerSender wraps a handlerSender for use in individual streams,
// adding a configurable per-write delay to enforce send-side rate limiting.
type streamHandlerSender struct {
	*handlerSender

	// sendDelay is the duration to sleep after each write to a stream.
	sendDelay time.Duration
}

// Write delegates to the embedded handlerSender and then sleeps for sendDelay
// to enforce the configured inter-frame send delay.
func (h streamHandlerSender) Write(b []byte) (int, error) {
	defer time.Sleep(h.sendDelay)

	return h.handlerSender.Write(b)
}

// Handler drives the per-client protocol loop. It reads incoming frames from
// receiver, demultiplexes them to the correct stream or control path, and
// writes responses via sender. A Handler is not safe for concurrent use; it
// must be driven by a single goroutine calling Handle.
type Handler struct {
	cfg          Configuration
	commands     *Commands
	receiver     rw.FetchReader
	sender       handlerSender
	senderPaused bool
	receiveDelay time.Duration
	sendDelay    time.Duration
	log          log.Logger
	hooks        Hooks
	bufferPool   *BufferPool
	rBuf         handlerBuf
	streams      streams
}

// newHandler constructs and returns a fully initialised Handler. All fields
// are set to their initial state; no goroutines are started.
func newHandler(
	cfg Configuration,
	commands *Commands,
	receiver rw.FetchReader,
	sender io.Writer,
	senderLock *sync.Mutex,
	receiveDelay time.Duration,
	sendDelay time.Duration,
	l log.Logger,
	hooks Hooks,
	bufferPool *BufferPool,
) Handler {
	return Handler{
		cfg:      cfg,
		commands: commands,
		receiver: receiver,
		sender: handlerSender{
			writer:   sender,
			lock:     senderLock,
			needWait: false,
			sign:     sync.NewCond(senderLock),
		},
		senderPaused: false,
		receiveDelay: receiveDelay,
		sendDelay:    sendDelay,
		log:          l,
		hooks:        hooks,
		bufferPool:   bufferPool,
		rBuf:         handlerBuf{},
		streams:      newStreams(),
	}
}

// handleControl handles Control request
//
// Params:
//   - d: length of the control message
//
// Returns:
//   - error
func (e *Handler) handleControl(d byte, l log.Logger) error {
	buf := e.rBuf[1:]

	if len(buf) < int(d) {
		return ErrHandlerControlMessageTooLong
	}

	rLen, rErr := io.ReadFull(&e.receiver, buf[:d])

	if rErr != nil {
		return rErr
	}

	if rLen <= 0 {
		return ErrHandlerInvalidControlMessage
	}

	switch buf[0] {
	case HeaderControlEcho:
		l.Debug("Echo %d bytes", d)

		hd := HeaderControl
		hd.Set(d)

		e.rBuf[0] = byte(hd)
		e.rBuf[1] = HeaderControlEcho

		var wErr error

		if !e.senderPaused {
			_, wErr = e.sender.Write(e.rBuf[:rLen+1])
		} else {
			e.sender.lock.Lock()
			defer e.sender.lock.Unlock()

			_, wErr = e.sender.writer.Write(e.rBuf[:rLen+1])
		}

		return wErr

	case HeaderControlPauseStream:
		if !e.senderPaused {
			e.sender.pause()
			e.senderPaused = true

			l.Debug("Pause Stream")
		} else {
			l.Debug("Repeated Pause Stream command, ignore")
		}

	case HeaderControlResumeStream:
		if e.senderPaused {
			e.sender.resume()
			e.senderPaused = false

			l.Debug("Resume Stream")
		} else {
			l.Debug("Repeated Resume Stream command, ignore")
		}
	}

	return nil
}

// handleStream handles streams
//
// Params:
//   - d: Stream ID
//
// Returns:
//   - error
func (e *Handler) handleStream(h Header, d byte, l log.Logger) error {
	st, stErr := e.streams.get(d)

	if stErr != nil {
		return stErr
	}

	// WARNING: stream.Tick and it's underlaying commands MUST NOT write to
	//          client. This is because the client data writer maybe locked
	//          and only current routine (the same routine will be used to
	//          tick the stream) can unlock it.
	//          Calling write may dead lock the routine, with there is no way
	//          of recover.
	if st.running() {
		l.Debug("Ticking stream")

		return st.tick(h, &e.receiver, e.rBuf[:])
	}

	l.Debug("Start stream %d", h.Data())

	if e.senderPaused {
		e.sender.resume()
		defer e.sender.pause()
	}

	return st.reinit(h, &e.receiver, streamHandlerSender{
		handlerSender: &e.sender,
		sendDelay:     e.sendDelay,
	}, l, e.hooks, e.commands, e.cfg, e.bufferPool, e.rBuf[:])
}

// handleClose processes a HeaderClose frame for stream d. It calls the stream's
// close method and then sends a HeaderCompleted acknowledgement back to the
// client. If the sender is paused it is temporarily resumed for the reply.
func (e *Handler) handleClose(h Header, d byte, _ log.Logger) error {
	st, stErr := e.streams.get(d)

	if stErr != nil {
		return stErr
	}

	if e.senderPaused {
		e.sender.resume()
		defer e.sender.pause()
	}

	cErr := st.close()

	if cErr != nil {
		return cErr
	}

	hhd := HeaderCompleted
	hhd.Set(h.Data())

	return e.sender.signal(hhd, nil, e.rBuf[:])
}

// handleCompleted processes a HeaderCompleted frame for stream d, releasing the
// stream's resources so the slot can be reused.
func (e *Handler) handleCompleted(d byte, l log.Logger) error {
	st, stErr := e.streams.get(d)

	if stErr != nil {
		return stErr
	}

	if e.senderPaused {
		e.sender.resume()
		defer e.sender.pause()
	}

	return st.release()
}

// Handle runs the main protocol dispatch loop for the client connection. It
// reads one frame at a time, routes it to handleControl, handleStream,
// handleClose, or handleCompleted, and returns the first error encountered.
// On return it ensures any paused sender is resumed and all active streams are
// shut down.
func (e *Handler) Handle() error {
	defer func() {
		if e.senderPaused {
			e.sender.resume()
			e.senderPaused = false
		}

		e.streams.shutdown()
	}()

	requests := 0

	for {
		time.Sleep(e.receiveDelay)

		requests++

		d, dErr := rw.FetchOneByte(e.receiver.Fetch)

		if dErr != nil {
			return dErr
		}

		h := Header(d[0])
		l := e.log.TitledContext("Request (%d)", requests).Context(h.String())

		l.Debug("Received")

		switch h.Type() {
		case HeaderControl:
			dErr = e.handleControl(h.Data(), l)

		case HeaderStream:
			dErr = e.handleStream(h, h.Data(), l)

		case HeaderClose:
			dErr = e.handleClose(h, h.Data(), l)

		case HeaderCompleted:
			dErr = e.handleCompleted(h.Data(), l)

		default:
			return ErrHandlerUnknownHeaderType
		}

		if dErr != nil {
			l.Debug("Request failed: %s", dErr)

			return dErr
		}

		l.Debug("Request successful")
	}
}
