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
)

// NonDebugWriter is a Writer variant that suppresses Debug-level messages.
// Info, Warning, and Error output is forwarded to the underlying io.Writer
// unchanged; Context and TitledContext return new NonDebugWriter instances
// so the suppression is inherited by child loggers.
type NonDebugWriter struct {
	Writer
}

// NewNonDebugWriter creates a NonDebugWriter that writes to w under the given
// initial context label.
func NewNonDebugWriter(context string, w io.Writer) NonDebugWriter {
	return NonDebugWriter{
		Writer: NewWriter(context, w),
	}
}

// NewDebugOrNonDebugWriter returns a Writer when useDebug is true or a
// NonDebugWriter when false, allowing callers to select the log verbosity at
// runtime without branching everywhere.
func NewDebugOrNonDebugWriter(
	useDebug bool, context string, w io.Writer) Logger {
	if useDebug {
		return NewWriter(context, w)
	}
	return NewNonDebugWriter(context, w)
}

// Context returns a child NonDebugWriter with name appended to the context
// path, preserving debug suppression in the child.
func (w NonDebugWriter) Context(name string) Logger {
	return NewNonDebugWriter(w.c+" > "+name, w.w)
}

// TitledContext returns a child NonDebugWriter with a formatted name appended
// to the context path, preserving debug suppression in the child.
func (w NonDebugWriter) TitledContext(
	name string,
	params ...any,
) Logger {
	return NewNonDebugWriter(w.c+" > "+fmt.Sprintf(name, params...), w.w)
}

// Debug is a no-op in NonDebugWriter; debug messages are silently discarded.
func (w NonDebugWriter) Debug(msg string, params ...any) {}
