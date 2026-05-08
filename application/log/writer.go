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

package log

import (
	"fmt"
	"io"
	"time"
)

// Writer is a Logger implementation that formats each message with a prefix
// containing the log level, RFC1123 timestamp, and the hierarchical context
// path, and writes it to the underlying io.Writer. All four severity levels are
// active, including Debug.
type Writer struct {
	// c is the accumulated context path, e.g. "Root > Server > Request".
	c string
	// w is the output destination.
	w io.Writer
}

// NewWriter creates a Writer that writes to w with the given initial context
// label.
func NewWriter(context string, w io.Writer) Writer {
	return Writer{
		c: context,
		w: w,
	}
}

// Context returns a child Writer with name appended to the context path.
func (w Writer) Context(name string) Logger {
	return NewWriter(w.c+" > "+name, w.w)
}

// TitledContext returns a child Writer with a formatted name appended to the
// context path.
func (w Writer) TitledContext(name string, params ...any) Logger {
	return NewWriter(w.c+" > "+fmt.Sprintf(name, params...), w.w)
}

// Write satisfies io.Writer by logging b at the "DEF" severity level.
func (w Writer) Write(b []byte) (int, error) {
	_, wErr := w.write("DEF", string(b))

	if wErr != nil {
		return 0, wErr
	}

	return len(b), nil
}

// write formats and emits a single log line with the given prefix tag (e.g.
// "INF", "DBG"), the current RFC1123 timestamp, the context path, and the
// message. It returns the number of bytes written and any write error.
func (w Writer) write(
	prefix string, msg string, params ...any) (int, error) {
	return fmt.Fprintf(w.w, "["+prefix+"] "+
		time.Now().Format(time.RFC1123)+" "+w.c+": "+msg+"\r\n", params...)
}

// Info write an info message
func (w Writer) Info(msg string, params ...any) {
	w.write("INF", msg, params...)
}

// Debug write an debug message
func (w Writer) Debug(msg string, params ...any) {
	w.write("DBG", msg, params...)
}

// Warning write an warning message
func (w Writer) Warning(msg string, params ...any) {
	w.write("WRN", msg, params...)
}

// Error write an error message
func (w Writer) Error(msg string, params ...any) {
	w.write("ERR", msg, params...)
}
