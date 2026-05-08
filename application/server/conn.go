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

// Package server provides the HTTP(S) server lifecycle for Sshwifty, including
// TCP listener setup, TLS configuration, graceful shutdown, and a conn wrapper
// that prevents clients from extending their connection timeouts beyond the
// configured limits.
package server

import (
	"net"
	"time"

	"github.com/Snuffy2/sshwifty/application/network"
)

// listener wraps a *net.TCPListener to wrap each accepted connection in a
// conn that enforces per-connection read and write timeouts.
type listener struct {
	*net.TCPListener

	// readTimeout is the maximum duration permitted for a single read operation.
	readTimeout time.Duration
	// writeTimeout is the maximum duration permitted for a single write operation.
	writeTimeout time.Duration
}

// Accept calls the underlying TCPListener.Accept and wraps the resulting
// net.Conn in a timeout-enforcing conn.
func (l listener) Accept() (net.Conn, error) {
	acc, accErr := l.TCPListener.Accept()

	if accErr != nil {
		return nil, accErr
	}

	timeoutConn := network.NewTimeoutConn(acc, l.readTimeout, l.writeTimeout)

	return conn{
		TimeoutConn:  &timeoutConn,
		readTimeout:  l.readTimeout,
		writeTimeout: l.writeTimeout,
	}, nil
}

// conn is a net.Conn wrapper that prevents the HTTP server (or any handler)
// from setting deadlines that exceed the server-configured maximums. This
// ensures clients cannot extend their connection lifetime beyond what the
// operator has configured.
type conn struct {
	*network.TimeoutConn

	// readTimeout is the maximum read deadline that may be set on this conn.
	readTimeout time.Duration
	// writeTimeout is the maximum write deadline that may be set on this conn.
	writeTimeout time.Duration
}

// normalizeTimeout clamps t to at most now+m, preventing callers from setting
// a deadline further in the future than the configured timeout allows.
func (c conn) normalizeTimeout(t time.Time, m time.Duration) time.Time {
	max := time.Now().Add(m)

	// You cannot set timeout that is longer than the given m
	if t.After(max) {
		return max
	}

	return t
}

// SetDeadline calls SetReadDeadline and SetWriteDeadline with the normalised
// deadline and always returns nil.
func (c conn) SetDeadline(dl time.Time) error {
	c.SetReadDeadline(dl)
	c.SetWriteDeadline(dl)

	return nil
}

// SetReadDeadline forwards dl to the underlying TimeoutConn after clamping it
// to at most now+readTimeout.
func (c conn) SetReadDeadline(dl time.Time) error {
	return c.TimeoutConn.SetReadDeadline(
		c.normalizeTimeout(dl, c.readTimeout))
}

// SetWriteDeadline forwards dl to the underlying TimeoutConn after clamping it
// to at most now+writeTimeout.
func (c conn) SetWriteDeadline(dl time.Time) error {
	return c.TimeoutConn.SetWriteDeadline(
		c.normalizeTimeout(dl, c.writeTimeout))
}
