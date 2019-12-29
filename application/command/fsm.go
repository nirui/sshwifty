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

	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrFSMMachineClosed = errors.New(
		"FSM Machine is already closed, it cannot do anything but be released")
)

// FSMError Represents an error from FSM
type FSMError struct {
	code    StreamError
	message string
	succeed bool
}

// ToFSMError converts error to FSMError
func ToFSMError(e error, c StreamError) FSMError {
	return FSMError{
		code:    c,
		message: e.Error(),
		succeed: false,
	}
}

// NoFSMError return a FSMError that represents a success operation
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

// FSMState represents a state of a machine
type FSMState func(f *FSM, r *rw.LimitedReader, h StreamHeader, b []byte) error

// FSMMachine State machine
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

// FSM state machine control
type FSM struct {
	m      FSMMachine
	s      FSMState
	closed bool
}

// newFSM creates a new FSM
func newFSM(m FSMMachine) FSM {
	return FSM{
		m:      m,
		s:      nil,
		closed: false,
	}
}

// emptyFSM creates a empty FSM
func emptyFSM() FSM {
	return FSM{
		m: nil,
		s: nil,
	}
}

// bootup initialize the machine
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

// running returns whether or not current FSM is running
func (f *FSM) running() bool {
	return f.s != nil
}

// tick ticks current machine
func (f *FSM) tick(r *rw.LimitedReader, h StreamHeader, b []byte) error {
	if f.closed {
		return ErrFSMMachineClosed
	}

	return f.s(f, r, h, b)
}

// Release shuts down current machine and release it's resource
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

// Close stops the machine and get it ready to release
func (f *FSM) close() error {
	f.closed = true

	return f.m.Close()
}

// Switch switch to specificied State for the next tick
func (f *FSM) Switch(s FSMState) {
	f.s = s
}
