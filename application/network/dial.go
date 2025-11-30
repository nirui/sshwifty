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
)

// Dial dial to remote machine
type Dial func(
	ctx context.Context,
	network string,
	address string,
) (net.Conn, error)

// TCPDial build a TCP dialer
func TCPDial() Dial {
	dial := net.Dialer{}
	return func(
		ctx context.Context,
		network string,
		address string,
	) (net.Conn, error) {
		if ctx == nil {
			return dial.Dial(network, address)
		}
		return dial.DialContext(ctx, network, address)
	}
}
