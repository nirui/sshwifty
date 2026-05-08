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

package controller

import "fmt"

// Error represents an HTTP-level error that carries both a numeric status code
// and a human-readable message. It implements the error interface so it can be
// returned from controller methods and inspected by the dispatcher to choose
// the appropriate HTTP response code.
type Error struct {
	// code is the HTTP status code associated with this error (e.g. 404, 500).
	code int
	// message is the human-readable description of the error condition.
	message string
}

// NewError creates a new Error with the given HTTP status code and message.
func NewError(code int, message string) Error {
	return Error{
		code:    code,
		message: message,
	}
}

// Code returns the HTTP status code associated with this error.
func (f Error) Code() int {
	return f.code
}

// Error returns a formatted string containing the HTTP status code and the
// error message, satisfying the error interface.
func (f Error) Error() string {
	return fmt.Sprintf("HTTP Error (%d): %s", f.code, f.message)
}
