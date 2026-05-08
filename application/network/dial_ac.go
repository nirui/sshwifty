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

// ErrAccessControlDialTargetHostNotAllowed is returned by AccessControlDial
// when the requested address is not in the AllowedHost set.
var (
	ErrAccessControlDialTargetHostNotAllowed = errors.New(
		"unable to dial to the specified remote host due to restriction")
)

// AllowedHosts is a set of permitted host:port strings. It implements
// AllowedHost and is used to enforce the OnlyAllowPresetRemotes restriction.
type AllowedHosts map[string]struct{}

// Allowed reports whether host is in the allow-set.
func (a AllowedHosts) Allowed(host string) bool {
	_, ok := a[host]
	return ok
}

// AllowedHost is the interface checked by AccessControlDial before delegating
// each dial attempt. Implementations return true when the address is permitted.
type AllowedHost interface {
	Allowed(host string) bool
}

// AccessControlDial wraps dial with an access-control check. Before each
// connection attempt it calls allowed.Allowed(address); if the address is not
// allowed it returns ErrAccessControlDialTargetHostNotAllowed without dialing.
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
