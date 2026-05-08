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

	"github.com/Snuffy2/sshwifty/application/rw"
)

// ErrFSMMachineClosed is returned by FSM.tick when the machine has already been
// closed and is awaiting release; no further ticks are permitted.
var (
	ErrFSMMachineClosed = errors.New(
		"FSM Machine is already closed, it cannot do anything but be released")
)

// FSMError carries the outcome of an FSM operation, combining a stream-level
// error code with a human-readable message and a success flag. A zero-value
// FSMError is not valid; use ToFSMError or NoFSMError to construct one.
type FSMError struct {
	// code is the wire-level StreamError value sent to the client.
	code StreamError
	// message is the human-readable description of the error.
	message string
	// succeed indicates whether the operation completed without error.
	succeed bool
}

// ToFSMError wraps an existing error and attaches a StreamError code to it,
// producing a failed FSMError suitable for returning from Bootup.
func ToFSMError(e error, c StreamError) FSMError {
	return FSMError{
		code:    c,
		message: e.Error(),
		succeed: false,
	}
}

// NoFSMError returns a FSMError that represents a successful operation. Its
// Succeed method returns true and its Code is zero.
func NoFSMError() FSMError {
	return FSMError{
		code:    0,
		message: "No error",
		succeed: true,
	}
}

// Error return the error message
func (e FSMError) Error() string {
	return e.message
}

// Code return the error code
func (e FSMError) Code() StreamError {
	return e.code
}

// Succeed returns whether or not current error represents a succeed operation
func (e FSMError) Succeed() bool {
	return e.succeed
}

// FSMState is the signature for a single state function within an FSMMachine.
// When called it reads data from r using scratch buffer b, applies the current
// stream header h, and returns nil on success or an error that will terminate
// the stream. It may call f.Switch to transition to another state.
type FSMState func(f *FSM, r *rw.LimitedReader, h StreamHeader, b []byte) error

// FSMMachine is the interface that each command must implement to participate in
// the stream multiplexer. The lifecycle is: Bootup -> (zero or more ticks via
// FSMState) -> Close -> Release.
type FSMMachine interface {
	// Bootup boots up the machine
	Bootup(r *rw.LimitedReader, b []byte) (FSMState, FSMError)

	// Close stops the machine and get it ready for release.
	//
	// NOTE: Close function is responsible in making sure the HeaderClose signal
	//       is sent before it returns.
	//       (It may not need to send the header by itself, but it have to
	//       make sure the header is sent)
	Close() error

	// Release shuts the machine down completely and release it's resources
	Release() error
}

// FSM is the controller wrapper around an FSMMachine. It tracks the active
// state function and whether the machine has been closed, enforcing the correct
// lifecycle order on behalf of the stream multiplexer.
type FSM struct {
	// m is the underlying command machine implementation.
	m FSMMachine
	// s is the current state function; nil means the machine has not booted.
	s FSMState
	// closed indicates that Close has been called and no further ticks are allowed.
	closed bool
}

// newFSM creates a new FSM wrapping the given machine, ready to be booted.
func newFSM(m FSMMachine) FSM {
	return FSM{
		m:      m,
		s:      nil,
		closed: false,
	}
}

// emptyFSM creates an FSM with no underlying machine, used to represent an
// unoccupied stream slot.
func emptyFSM() FSM {
	return FSM{
		m: nil,
		s: nil,
	}
}

// bootup calls the machine's Bootup method with the initial data reader and
// scratch buffer, then stores the returned FSMState. It panics if Bootup
// returns a nil state. On failure the FSMError is returned without changing
// the active state.
func (f *FSM) bootup(r *rw.LimitedReader, b []byte) FSMError {
	s, err := f.m.Bootup(r, b)

	if s == nil {
		panic("FSMState must not be nil")
	}

	if !err.Succeed() {
		return err
	}

	f.s = s

	return err
}

// running returns true if the machine has booted and has an active state
// function, meaning it is ready to accept ticks.
func (f *FSM) running() bool {
	return f.s != nil
}

// tick invokes the current FSMState function with the incoming frame data. It
// returns ErrFSMMachineClosed if the machine has already been closed.
func (f *FSM) tick(r *rw.LimitedReader, h StreamHeader, b []byte) error {
	if f.closed {
		return ErrFSMMachineClosed
	}

	return f.s(f, r, h, b)
}

// release shuts the machine down completely and frees its resources. It calls
// close first if that has not yet been done, then calls Release on the
// underlying machine and nils the machine reference.
func (f *FSM) release() error {
	f.s = nil

	if !f.closed {
		f.close()
	}

	rErr := f.m.Release()

	f.m = nil

	if rErr != nil {
		return rErr
	}

	return nil
}

// close marks the machine as closed and delegates to the underlying machine's
// Close method, which must ensure a HeaderClose signal is sent before returning.
func (f *FSM) close() error {
	f.closed = true

	return f.m.Close()
}

// Switch transitions the FSM to the given state, which will be invoked on the
// next tick. It is called from within a running FSMState to change behaviour.
func (f *FSM) Switch(s FSMState) {
	f.s = s
}
