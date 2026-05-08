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

// Package configuration defines the data types and loader infrastructure used
// to supply runtime settings to the Sshwifty application. It supports multiple
// configuration sources (environment variables, JSON files, direct injection)
// through the Loader function type and a Redundant combinator.
package configuration

import (
	"time"

	"github.com/Snuffy2/sshwifty/application/network"
)

// Common holds the configuration settings that are shared across all server
// instances within a single Configuration. It is derived from a Configuration
// via Configuration.Common() and passed to each server at startup.
type Common struct {
	// HostName is the public hostname used in generated links and TLS validation.
	HostName string
	// SharedKey is the pre-shared secret required for client authentication;
	// an empty value disables authentication.
	SharedKey string
	// Dialer is the function used to open outbound network connections,
	// optionally via SOCKS5 or with access-control restrictions.
	Dialer network.Dial
	// DialTimeout is the maximum duration permitted for a single outbound dial.
	DialTimeout time.Duration
	// Presets is the list of pre-configured remote endpoints shown in the UI.
	Presets []Preset
	// Hooks contains the hook settings that govern lifecycle callbacks.
	Hooks HookSettings
	// OnlyAllowPresetRemotes restricts outbound connections to hosts listed in
	// Presets when true.
	OnlyAllowPresetRemotes bool
}
