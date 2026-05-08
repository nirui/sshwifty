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

// Package commands registers all built-in protocol commands (Telnet and SSH)
// and exposes the factory function used to initialise the command dispatch
// table at startup.
package commands

import "github.com/Snuffy2/sshwifty/application/command"

// New creates and returns the fully populated command.Commands array with
// Telnet at index 0 and SSH at index 1, ready to be passed to a Commander.
func New() command.Commands {
	return command.Commands{
		command.Register("Telnet", newTelnet, parseTelnetConfig),
		command.Register("SSH", newSSH, parseSSHConfig),
	}
}
