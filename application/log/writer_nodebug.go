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

import (
	"fmt"
	"io"
)

// NonDebugWriter will write logs to the underlaying writer
type NonDebugWriter struct {
	Writer
}

// NewNonDebugWriter creates a new Writer with debug output disabled
func NewNonDebugWriter(context string, w io.Writer) NonDebugWriter {
	return NonDebugWriter{
		Writer: NewWriter(context, w),
	}
}

// NewDebugOrNonDebugWriter creates debug or nondebug log depends on
// given `useDebug`
func NewDebugOrNonDebugWriter(
	useDebug bool, context string, w io.Writer) Logger {
	if useDebug {
		return NewWriter(context, w)
	}

	return NewNonDebugWriter(context, w)
}

// Context build a new Sub context
func (w NonDebugWriter) Context(name string, params ...interface{}) Logger {
	return NewNonDebugWriter(w.c+" > "+fmt.Sprintf(name, params...), w.w)
}

// Debug ditchs debug operation
func (w NonDebugWriter) Debug(msg string, params ...interface{}) {}
