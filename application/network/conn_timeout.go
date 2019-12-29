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

package network

import (
	"net"
	"time"
)

// TimeoutConn read write
type TimeoutConn struct {
	net.Conn

	readTimeout             time.Duration
	disableNextReadTimeout  bool
	writeTimeout            time.Duration
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

// SetReadTimeout sets read timeout
func (c *TimeoutConn) SetReadTimeout(t time.Duration) {
	c.readTimeout = t
}

// SetReadDeadline sets the next read deadline
func (c *TimeoutConn) SetReadDeadline(t time.Time) error {
	c.disableNextReadTimeout = t.Before(time.Now())

	if t.Equal(emptyTime) {
		return c.Conn.SetReadDeadline(time.Now().Add(c.readTimeout))
	}

	return c.Conn.SetReadDeadline(t)
}

// Read reads data
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

// SetWriteTimeout sets write timeout
func (c *TimeoutConn) SetWriteTimeout(t time.Duration) {
	c.writeTimeout = t
}

// SetWriteDeadline sets the next read deadline
func (c *TimeoutConn) SetWriteDeadline(t time.Time) error {
	c.disableNextWriteTimeout = t.Before(time.Now())

	if t.Equal(emptyTime) {
		return c.Conn.SetWriteDeadline(time.Now().Add(c.writeTimeout))
	}

	return c.Conn.SetWriteDeadline(t)
}

// Write writes data
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

// SetDeadline sets read and write deadline
func (c *TimeoutConn) SetDeadline(t time.Time) error {
	c.SetReadDeadline(t)
	c.SetWriteDeadline(t)

	return nil
}

// ReadTimeoutConn is a reader that will enforce a timeout rules
type ReadTimeoutConn struct {
	net.Conn

	reader TimeoutConn
}

// NewReadTimeoutConn creates a ReadTimeoutConn
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

// SetReadDeadline sets read deadline
func (c *ReadTimeoutConn) SetReadDeadline(t time.Time) error {
	return c.reader.SetReadDeadline(t)
}

// SetReadTimeout sets write timeout
func (c *ReadTimeoutConn) SetReadTimeout(t time.Duration) {
	c.reader.SetReadTimeout(t)
}

// Read writes data
func (c ReadTimeoutConn) Read(b []byte) (int, error) {
	return c.reader.Read(b)
}

// WriteTimeoutConn is a writer that will enforce a timeout rules onto a
// net.Conn
type WriteTimeoutConn struct {
	net.Conn

	writer TimeoutConn
}

// NewWriteTimeoutConn creates a WriteTimeoutConnWriter
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

// SetWriteDeadline sets write deadline
func (c *WriteTimeoutConn) SetWriteDeadline(t time.Time) error {
	return c.writer.SetWriteDeadline(t)
}

// SetWriteTimeout sets write timeout
func (c *WriteTimeoutConn) SetWriteTimeout(t time.Duration) {
	c.writer.SetWriteTimeout(t)
}

// Write writes data
func (c WriteTimeoutConn) Write(b []byte) (int, error) {
	return c.writer.Write(b)
}
