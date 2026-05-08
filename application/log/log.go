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

// Logger is the structured logging interface used throughout the application.
// Implementations must be safe to use concurrently.
//
//   - Context creates a child logger whose output is prefixed with name.
//   - TitledContext creates a child logger with a formatted name.
//   - Write satisfies io.Writer for compatibility with the standard library logger.
//   - Info, Debug, Warning, and Error emit messages at the corresponding severity.
type Logger interface {
	// Context returns a child Logger prefixed with name.
	Context(name string) Logger
	// TitledContext returns a child Logger with a formatted name prefix.
	TitledContext(name string, params ...any) Logger
	// Write satisfies io.Writer; implementations may log at a default severity.
	Write(b []byte) (int, error)
	// Info logs an informational message.
	Info(msg string, params ...any)
	// Debug logs a diagnostic message that may be suppressed in production.
	Debug(msg string, params ...any)
	// Warning logs a warning message indicating a potentially problematic condition.
	Warning(msg string, params ...any)
	// Error logs an error message indicating a failure condition.
	Error(msg string, params ...any)
}
