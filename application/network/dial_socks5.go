// Sshwifty - A Web SSH client
//
// Copyright (C) 2019 Rui NI <nirui@gmx.com>
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

	"golang.org/x/net/proxy"
)

var (
	emptyTime = time.Time{}
)

type socks5Conn struct {
	net.Conn

	initialReadDeadline time.Time
}

func (s *socks5Conn) Read(b []byte) (int, error) {
	if s.initialReadDeadline != emptyTime {
		s.SetReadDeadline(s.initialReadDeadline)
		s.initialReadDeadline = emptyTime

		defer s.SetReadDeadline(emptyTime)
	}

	rLen, rErr := s.Conn.Read(b)

	return rLen, rErr
}

// BuildSocks5Dial builds a Socks5 dialer
func BuildSocks5Dial(
	socks5Address string, userName string, password string) (Dial, error) {
	var auth *proxy.Auth

	if len(userName) > 0 || len(password) > 0 {
		auth = &proxy.Auth{
			User:     userName,
			Password: password,
		}
	}

	return func(
		network string,
		address string,
		timeout time.Duration,
	) (net.Conn, error) {
		dialCfg := net.Dialer{
			Timeout:  timeout,
			Deadline: time.Now().Add(timeout),
		}

		dial, dialErr := proxy.SOCKS5("tcp", socks5Address, auth, &dialCfg)

		if dialErr != nil {
			return nil, dialErr
		}

		dialConn, dialErr := dial.Dial(network, address)

		if dialErr != nil {
			return nil, dialErr
		}

		return &socks5Conn{
			Conn:                dialConn,
			initialReadDeadline: dialCfg.Deadline,
		}, nil
	}, nil
}
