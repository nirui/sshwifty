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
	"time"
)

// Writer will write logs to the underlaying writer
type Writer struct {
	c string
	w io.Writer
}

// NewWriter creates a new Writer
func NewWriter(context string, w io.Writer) Writer {
	return Writer{
		c: context,
		w: w,
	}
}

// Context build a new Sub context
func (w Writer) Context(name string, params ...interface{}) Logger {
	return NewWriter(w.c+" > "+fmt.Sprintf(name, params...), w.w)
}

// Write writes default error
func (w Writer) Write(b []byte) (int, error) {
	_, wErr := w.write("DEF", string(b))

	if wErr != nil {
		return 0, wErr
	}

	return len(b), nil
}

func (w Writer) write(
	prefix string, msg string, params ...interface{}) (int, error) {
	return fmt.Fprintf(w.w, "["+prefix+"] "+
		time.Now().Format(time.RFC1123)+" "+w.c+": "+msg+"\r\n", params...)
}

// Info write an info message
func (w Writer) Info(msg string, params ...interface{}) {
	w.write("INF", msg, params...)
}

// Debug write an debug message
func (w Writer) Debug(msg string, params ...interface{}) {
	w.write("DBG", msg, params...)
}

// Warning write an warning message
func (w Writer) Warning(msg string, params ...interface{}) {
	w.write("WRN", msg, params...)
}

// Error write an error message
func (w Writer) Error(msg string, params ...interface{}) {
	w.write("ERR", msg, params...)
}
