// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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

package main

import (
	"os"

	"github.com/niruix/sshwifty/application"
	"github.com/niruix/sshwifty/application/commands"
	"github.com/niruix/sshwifty/application/configuration"
	"github.com/niruix/sshwifty/application/controller"
	"github.com/niruix/sshwifty/application/log"
)

func main() {
	configLoaders := make([]configuration.Loader, 0, 2)

	if len(os.Getenv("SSHWIFTY_CONFIG")) > 0 {
		configLoaders = append(configLoaders,
			configuration.File(os.Getenv("SSHWIFTY_CONFIG")))
	} else {
		configLoaders = append(configLoaders, configuration.File(""))
		configLoaders = append(configLoaders, configuration.Enviro())
	}

	e := application.
		New(os.Stderr, log.NewDebugOrNonDebugWriter(
			len(os.Getenv("SSHWIFTY_DEBUG")) > 0, application.Name, os.Stderr)).
		Run(configuration.Redundant(configLoaders...),
			application.DefaultProccessSignallerBuilder,
			commands.New(),
			controller.Builder)

	if e == nil {
		return
	}

	os.Exit(1)
}
