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
	"context"
	"net"
	"time"

	"golang.org/x/net/proxy"
)

type socks5Dial struct {
	net.Dialer
}

func (s socks5Dial) Dial(
	network, address string) (net.Conn, error) {
	conn, dErr := s.Dialer.Dial(network, address)

	if dErr == nil {
		conn.SetReadDeadline(time.Now().Add(s.Dialer.Timeout))
	}

	return conn, dErr
}

func (s socks5Dial) DialContext(
	ctx context.Context, network, address string) (net.Conn, error) {
	conn, dErr := s.Dialer.DialContext(ctx, network, address)

	if dErr == nil {
		conn.SetReadDeadline(time.Now().Add(s.Dialer.Timeout))
	}

	return conn, dErr
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
		dialCfg := socks5Dial{
			Dialer: net.Dialer{
				Timeout:  timeout,
				Deadline: time.Now().Add(timeout),
			},
		}

		dial, dialErr := proxy.SOCKS5("tcp", socks5Address, auth, &dialCfg)

		if dialErr != nil {
			return nil, dialErr
		}

		dialConn, dialErr := dial.Dial(network, address)

		if dialErr != nil {
			return nil, dialErr
		}

		dialConn.SetReadDeadline(emptyTime)

		return dialConn, nil
	}, nil
}
