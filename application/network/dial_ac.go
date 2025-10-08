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
	"errors"
	"net"
)

// Errors
var (
	ErrAccessControlDialTargetHostNotAllowed = errors.New(
		"unable to dial to the specified remote host due to restriction")
)

// AllowedHosts contains a map of allowed remote hosts
type AllowedHosts map[string]struct{}

// Allowed returns whether or not given host is allowed
func (a AllowedHosts) Allowed(host string) bool {
	_, ok := a[host]
	return ok
}

// AllowedHost returns whether or not give host is allowed
type AllowedHost interface {
	Allowed(host string) bool
}

// AccessControlDial creates an access controlled Dial
func AccessControlDial(allowed AllowedHost, dial Dial) Dial {
	return func(
		ctx context.Context,
		network string,
		address string,
	) (net.Conn, error) {
		if !allowed.Allowed(address) {
			return nil, ErrAccessControlDialTargetHostNotAllowed
		}
		return dial(ctx, network, address)
	}
}
