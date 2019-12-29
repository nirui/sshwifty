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
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrHandlerUnknownHeaderType = errors.New(
		"Unknown command header type")

	ErrHandlerControlMessageTooLong = errors.New(
		"Control message was too long")

	ErrHandlerInvalidControlMessage = errors.New(
		"Invalid control message")
)

// HandlerCancelSignal signals the cancel of the entire handling proccess
type HandlerCancelSignal chan struct{}

const (
	handlerReadBufLen = HeaderMaxData + 3 // (3 = 1 Header, 2 Etc)
)

type handlerBuf [handlerReadBufLen]byte

// handlerSender writes handler signal
type handlerSender struct {
	writer   io.Writer
	lock     *sync.Mutex
	needWait bool
	sign     *sync.Cond
}

// pause pauses sending
func (h *handlerSender) pause() {
	h.lock.Lock()
	defer h.lock.Unlock()

	h.needWait = true
}

// resume resumes sending
func (h *handlerSender) resume() {
	h.lock.Lock()
	defer h.lock.Unlock()

	h.needWait = false
	h.sign.Broadcast()
}

// signal sends handler signal
func (h *handlerSender) signal(hd Header, d []byte, buf []byte) error {
	bufLen := len(buf)
	dLen := len(d)

	if bufLen < dLen+1 {
		panic(fmt.Sprintln("Sending signal %s:%d requires %d bytes of buffer, "+
			"but only %d bytes is available", hd, d, dLen+1, bufLen))
	}

	buf[0] = byte(hd)

	wLen := copy(buf[1:], d) + 1

	_, wErr := h.Write(buf[:wLen])

	return wErr
}

// Write sends data
func (h *handlerSender) Write(b []byte) (int, error) {
	h.lock.Lock()
	defer h.lock.Unlock()

	for h.needWait {
		h.sign.Wait()
	}

	return h.writer.Write(b)
}

// streamHandlerSender includes all receiver as handlerSender, but it been
// designed to be use in streams
type streamHandlerSender struct {
	*handlerSender

	sendDelay time.Duration
}

// signal sends handler signal
func (h streamHandlerSender) signal(hd Header, d []byte, buf []byte) error {
	return h.handlerSender.signal(hd, d, buf)
}

// Write sends data
func (h streamHandlerSender) Write(b []byte) (int, error) {
	defer time.Sleep(h.sendDelay)

	return h.handlerSender.Write(b)
}

// Handler client stream control
type Handler struct {
	cfg          Configuration
	commands     *Commands
	receiver     rw.FetchReader
	sender       handlerSender
	senderPaused bool
	receiveDelay time.Duration
	sendDelay    time.Duration
	log          log.Logger
	rBuf         handlerBuf
	streams      streams
}

func newHandler(
	cfg Configuration,
	commands *Commands,
	receiver rw.FetchReader,
	sender io.Writer,
	senderLock *sync.Mutex,
	receiveDelay time.Duration,
	sendDelay time.Duration,
	l log.Logger,
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
	}, l, e.commands, e.cfg, e.rBuf[:])
}

func (e *Handler) handleClose(h Header, d byte, l log.Logger) error {
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

// Handle starts handling
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
		l := e.log.Context("Request (%d)", requests).Context(h.String())

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
