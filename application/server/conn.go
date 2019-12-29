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

package server

import (
	"net"
	"time"

	"github.com/niruix/sshwifty/application/network"
)

var (
	emptyTime = time.Time{}
)

type listener struct {
	*net.TCPListener

	readTimeout  time.Duration
	writeTimeout time.Duration
}

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

// conn is a net.Conn hack, we use it prevent the upper to alter some important
// configuration of the connection, mainly the timeouts.
type conn struct {
	*network.TimeoutConn

	readTimeout  time.Duration
	writeTimeout time.Duration
}

func (c conn) normalizeTimeout(t time.Time, m time.Duration) time.Time {
	max := time.Now().Add(m)

	// You cannot set timeout that is longer than the given m
	if t.After(max) {
		return max
	}

	return t
}

func (c conn) SetDeadline(dl time.Time) error {
	c.SetReadDeadline(dl)
	c.SetWriteDeadline(dl)

	return nil
}

func (c conn) SetReadDeadline(dl time.Time) error {
	return c.TimeoutConn.SetReadDeadline(
		c.normalizeTimeout(dl, c.readTimeout))
}

func (c conn) SetWriteDeadline(dl time.Time) error {
	return c.TimeoutConn.SetWriteDeadline(
		c.normalizeTimeout(dl, c.writeTimeout))
}
