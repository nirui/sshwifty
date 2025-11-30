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
	"context"
	"net"

	"golang.org/x/net/proxy"
)

// socks5Dial dials to a SOCKS5 server
type socks5Dial struct {
	dialer Dial
	ctx    context.Context
}

// Dial implements proxy.Dialer
func (s socks5Dial) Dial(
	network string,
	address string,
) (net.Conn, error) {
	return s.dialer(s.ctx, network, address)
}

// Dial implements proxy.ContextDialer
func (s socks5Dial) DialContext(
	ctx context.Context,
	network string,
	address string,
) (net.Conn, error) {
	return s.dialer(ctx, network, address)
}

// BuildSocks5Dial builds a Socks5 dialer
func BuildSocks5Dial(
	dial Dial,
	socks5Address string,
	userName string,
	password string,
) Dial {
	var auth *proxy.Auth
	if len(userName) > 0 || len(password) > 0 {
		auth = &proxy.Auth{
			User:     userName,
			Password: password,
		}
	}
	return func(ctx context.Context, n string, addr string) (net.Conn, error) {
		dialCfg := socks5Dial{
			dialer: dial,
			ctx:    ctx,
		}
		dial, dialErr := proxy.SOCKS5("tcp", socks5Address, auth, &dialCfg)
		if dialErr != nil {
			return nil, dialErr
		}
		var dialConn net.Conn
		if d, ok := dial.(proxy.ContextDialer); ok {
			dialConn, dialErr = d.DialContext(ctx, n, addr)
		} else {
			// Wow, could you believe that? The Go team first hid
			// golang.org/x/net/internal/socks/Dialer behind an interface
			// golang.org/x/net/proxy/Dialer to only expose the Dial method,
			// and then they...guess what...deprecated it ask you to use
			// DialContext instead which they did not expose through the
			// interface, forcing user to do a type assert
			//
			// And these two, Dial and DialContext, behaves differently: Dial
			// creates new context.Background() all by itself when calling
			// golang.org/x/net/internal/socks/Dialer.ProxyDial as well as
			// performing SOCKS5 handshake, while DialContext uses the user
			// specified context which is the correct one to use
			//
			// Wow, this is really, like, top level architecture design, AI
			// can't never beat that at least not intentionally
			//
			// Maybe this is job security looked like at Google
			dialConn, dialErr = dial.Dial(n, addr)
		}
		if dialErr != nil {
			return nil, dialErr
		}
		return dialConn, nil
	}
}
