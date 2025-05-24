// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2023 Ni Rui <ranqus@gmail.com>
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

	"golang.org/x/net/proxy"
)

type socks5Dial struct {
	dialer net.Dialer
	ctx    context.Context
}

func (s socks5Dial) Dial(
	network string,
	address string,
) (net.Conn, error) {
	return s.dialer.DialContext(s.ctx, network, address)
}

// BuildSocks5Dial builds a Socks5 dialer
func BuildSocks5Dial(
	socks5Address string,
	userName string,
	password string,
) (Dial, error) {
	var auth *proxy.Auth
	if len(userName) > 0 || len(password) > 0 {
		auth = &proxy.Auth{
			User:     userName,
			Password: password,
		}
	}

	return func(ctx context.Context, n string, addr string) (net.Conn, error) {
		dialCfg := socks5Dial{
			dialer: net.Dialer{},
			ctx:    ctx,
		}

		dial, dialErr := proxy.SOCKS5("tcp", socks5Address, auth, &dialCfg)
		if dialErr != nil {
			return nil, dialErr
		}

		dialConn, dialErr := dial.Dial(n, addr)
		if dialErr != nil {
			return nil, dialErr
		}

		return dialConn, nil
	}, nil
}
