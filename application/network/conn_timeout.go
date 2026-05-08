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

package network

import (
	"net"
	"time"
)

// TimeoutConn wraps a net.Conn to enforce read and write timeouts. On each
// read or write that fails with a network timeout error, the deadline is
// automatically extended by the configured duration and the operation is
// retried once. The disableNextReadTimeout and disableNextWriteTimeout flags
// allow callers to suppress the retry for a single operation.
type TimeoutConn struct {
	net.Conn

	// readTimeout is the duration added to the read deadline after a timeout.
	readTimeout time.Duration
	// disableNextReadTimeout suppresses the retry extension for the next read.
	disableNextReadTimeout bool
	// writeTimeout is the duration added to the write deadline after a timeout.
	writeTimeout time.Duration
	// disableNextWriteTimeout suppresses the retry extension for the next write.
	disableNextWriteTimeout bool
}

// NewTimeoutConn creates a new TimeoutConn
func NewTimeoutConn(
	c net.Conn,
	rTimeout time.Duration,
	wTimeout time.Duration,
) TimeoutConn {
	return TimeoutConn{
		Conn:                    c,
		readTimeout:             rTimeout,
		disableNextReadTimeout:  false,
		writeTimeout:            wTimeout,
		disableNextWriteTimeout: false,
	}
}

// SetReadTimeout updates the read timeout duration used when automatically
// extending the deadline after a timeout error.
func (c *TimeoutConn) SetReadTimeout(t time.Duration) {
	c.readTimeout = t
}

// SetReadDeadline sets the read deadline. When t is the zero time (emptyTime)
// the deadline is reset to now+readTimeout. When t is in the past,
// disableNextReadTimeout is set to prevent a spurious retry on the next read.
func (c *TimeoutConn) SetReadDeadline(t time.Time) error {
	c.disableNextReadTimeout = t.Before(time.Now())

	if t.Equal(emptyTime) {
		return c.Conn.SetReadDeadline(time.Now().Add(c.readTimeout))
	}

	return c.Conn.SetReadDeadline(t)
}

// Read reads from the underlying connection. On a network timeout error it
// extends the read deadline by readTimeout and retries once, unless
// disableNextReadTimeout is set or readTimeout is non-positive.
func (c *TimeoutConn) Read(b []byte) (int, error) {
	defer func() {
		c.disableNextReadTimeout = false
	}()

	cLen, cErr := c.Conn.Read(b)

	if cErr == nil {
		return cLen, nil
	}

	netErr, isNetErr := cErr.(net.Error)

	if !isNetErr ||
		c.disableNextReadTimeout ||
		c.readTimeout <= 0 ||
		!netErr.Timeout() {
		return cLen, cErr
	}

	cErr = c.Conn.SetReadDeadline(time.Now().Add(c.readTimeout))

	if cErr != nil {
		return cLen, cErr
	}

	tryCLen, cErr := c.Conn.Read(b[cLen:])

	return tryCLen + cLen, cErr
}

// SetWriteTimeout updates the write timeout duration used when automatically
// extending the deadline after a timeout error.
func (c *TimeoutConn) SetWriteTimeout(t time.Duration) {
	c.writeTimeout = t
}

// SetWriteDeadline sets the write deadline. When t is the zero time (emptyTime)
// the deadline is reset to now+writeTimeout. When t is in the past,
// disableNextWriteTimeout is set to suppress the retry on the next write.
func (c *TimeoutConn) SetWriteDeadline(t time.Time) error {
	c.disableNextWriteTimeout = t.Before(time.Now())

	if t.Equal(emptyTime) {
		return c.Conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	}

	return c.Conn.SetWriteDeadline(t)
}

// Write writes to the underlying connection. On a network timeout error it
// extends the write deadline by writeTimeout and retries once, unless
// disableNextWriteTimeout is set or writeTimeout is non-positive.
func (c *TimeoutConn) Write(b []byte) (int, error) {
	defer func() {
		c.disableNextWriteTimeout = false
	}()

	cLen, cErr := c.Conn.Write(b)

	if cErr == nil {
		return cLen, nil
	}

	netErr, isNetErr := cErr.(net.Error)

	if !isNetErr ||
		c.disableNextWriteTimeout ||
		c.writeTimeout <= 0 ||
		!netErr.Timeout() {
		return cLen, cErr
	}

	cErr = c.Conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))

	if cErr != nil {
		return cLen, cErr
	}

	tryCLen, cErr := c.Conn.Write(b[cLen:])

	return tryCLen + cLen, cErr
}

// SetDeadline sets both the read and write deadlines by delegating to
// SetReadDeadline and SetWriteDeadline. It always returns nil.
func (c *TimeoutConn) SetDeadline(t time.Time) error {
	c.SetReadDeadline(t)
	c.SetWriteDeadline(t)

	return nil
}

// ReadTimeoutConn wraps a net.Conn to enforce only a read timeout, delegating
// writes directly to the underlying connection. It is used when only read-side
// deadline management is needed.
type ReadTimeoutConn struct {
	net.Conn

	// reader is the internal TimeoutConn used for read-side deadline enforcement.
	reader TimeoutConn
}

// NewReadTimeoutConn creates a ReadTimeoutConn that retries reads on timeout
// by extending the deadline by timeout.
func NewReadTimeoutConn(c net.Conn, timeout time.Duration) ReadTimeoutConn {
	return ReadTimeoutConn{
		Conn: c,
		reader: TimeoutConn{
			Conn:         c,
			readTimeout:  timeout,
			writeTimeout: 0,
		},
	}
}

// SetReadDeadline sets the read deadline on the internal TimeoutConn reader.
func (c *ReadTimeoutConn) SetReadDeadline(t time.Time) error {
	return c.reader.SetReadDeadline(t)
}

// SetReadTimeout updates the read timeout duration on the internal reader.
func (c *ReadTimeoutConn) SetReadTimeout(t time.Duration) {
	c.reader.SetReadTimeout(t)
}

// Read reads from the internal TimeoutConn reader, applying the configured
// read timeout and retry logic.
func (c ReadTimeoutConn) Read(b []byte) (int, error) {
	return c.reader.Read(b)
}

// WriteTimeoutConn wraps a net.Conn to enforce only a write timeout, delegating
// reads directly to the underlying connection. It is used when only write-side
// deadline management is needed.
type WriteTimeoutConn struct {
	net.Conn

	// writer is the internal TimeoutConn used for write-side deadline enforcement.
	writer TimeoutConn
}

// NewWriteTimeoutConn creates a WriteTimeoutConn that retries writes on timeout
// by extending the deadline by timeout.
func NewWriteTimeoutConn(c net.Conn, timeout time.Duration) WriteTimeoutConn {
	return WriteTimeoutConn{
		Conn: c,
		writer: TimeoutConn{
			Conn:         c,
			readTimeout:  0,
			writeTimeout: timeout,
		},
	}
}

// SetWriteDeadline sets the write deadline on the internal TimeoutConn writer.
func (c *WriteTimeoutConn) SetWriteDeadline(t time.Time) error {
	return c.writer.SetWriteDeadline(t)
}

// SetWriteTimeout updates the write timeout duration on the internal writer.
func (c *WriteTimeoutConn) SetWriteTimeout(t time.Duration) {
	c.writer.SetWriteTimeout(t)
}

// Write writes to the internal TimeoutConn writer, applying the configured
// write timeout and retry logic.
func (c WriteTimeoutConn) Write(b []byte) (int, error) {
	return c.writer.Write(b)
}
