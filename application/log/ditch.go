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

package log

// Ditch ditch all logs
type Ditch struct{}

// NewDitch creates a new Ditch
func NewDitch() Ditch {
	return Ditch{}
}

// Context build a new Sub context
func (w Ditch) Context(name string, params ...interface{}) Logger {
	return w
}

// Write writes default error
func (w Ditch) Write(b []byte) (int, error) {
	return len(b), nil
}

// Info write an info message
func (w Ditch) Info(msg string, params ...interface{}) {}

// Debug write an debug message
func (w Ditch) Debug(msg string, params ...interface{}) {}

// Warning write an warning message
func (w Ditch) Warning(msg string, params ...interface{}) {}

// Error write an error message
func (w Ditch) Error(msg string, params ...interface{}) {}
