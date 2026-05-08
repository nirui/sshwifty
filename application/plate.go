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

package application

// Plate information contains static identity strings for the application.
const (
	// Name is the short application name.
	Name = "Sshwifty"
	// FullName is the human-readable full application name.
	FullName = "Sshwifty Web SSH Client"
	// Author identifies the fork maintainer.
	Author = "Snuffy2"
	// URL is the canonical project URL.
	URL = "https://github.com/Snuffy2/sshwifty"
)

// banner is the startup message template printed to the screen on launch.
// Positional arguments: FullName, version, Author, URL.
const (
	banner = "\r\n %s %s\r\n\r\n Copyright (C) %s\r\n %s\r\n\r\n"
)

// version holds the current build version string, injected at link time.
// It defaults to "dev" when no version is provided by the build system.
var (
	version = "dev"
)
