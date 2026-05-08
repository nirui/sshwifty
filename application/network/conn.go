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

// Package network provides network connection utilities for Sshwifty, including
// timeout-enforcing net.Conn wrappers, TCP and SOCKS5 dialers, and an
// access-control dialer that restricts outbound connections to an allow-list.
package network

import (
	"time"
)

// emptyTime is the zero value of time.Time used to represent "no deadline" in
// SetDeadline/SetReadDeadline/SetWriteDeadline calls.
var (
	emptyTime = time.Time{}
)
