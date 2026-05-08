package configuration

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

// Preset describes a pre-configured remote endpoint displayed in the Sshwifty
// UI. Each Preset is associated with a command type (e.g. "SSH" or "Telnet")
// and may carry command-specific metadata in the Meta map.
type Preset struct {
	// Title is the human-readable label shown in the UI tab.
	Title string
	// Type identifies the command that handles this preset (e.g. "SSH").
	Type string
	// Host is the address (and optional port) of the remote endpoint.
	Host string
	// TabColor is an optional CSS colour string used to tint the UI tab.
	TabColor string
	// Meta holds command-specific key/value options (e.g. SSH username).
	Meta map[string]string
}
