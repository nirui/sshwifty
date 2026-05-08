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

// Package log defines the Logger interface used throughout the application and
// provides two concrete implementations: Writer (full logging) and
// NonDebugWriter (debug messages suppressed), plus Ditch (all messages
// silently discarded).
package log

// Ditch is a no-op Logger implementation that discards every log message and
// write. It is useful in tests or when a logger must be provided but output is
// not desired.
type Ditch struct{}

// NewDitch creates and returns a Ditch logger.
func NewDitch() Ditch {
	return Ditch{}
}

// Context returns the same Ditch logger; no sub-context is created.
func (w Ditch) Context(name string) Logger {
	return w
}

// TitledContext returns the same Ditch logger; no sub-context is created.
func (w Ditch) TitledContext(name string, params ...any) Logger {
	return w
}

// Write discards b and reports success to satisfy io.Writer.
func (w Ditch) Write(b []byte) (int, error) {
	return len(b), nil
}

// Info write an info message
func (w Ditch) Info(msg string, params ...any) {}

// Debug write an debug message
func (w Ditch) Debug(msg string, params ...any) {}

// Warning write an warning message
func (w Ditch) Warning(msg string, params ...any) {}

// Error write an error message
func (w Ditch) Error(msg string, params ...any) {}
