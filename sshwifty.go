// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2023 Ni Rui <ranqus@gmail.com>
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

	"github.com/nirui/sshwifty/application"
	"github.com/nirui/sshwifty/application/commands"
	"github.com/nirui/sshwifty/application/configuration"
	"github.com/nirui/sshwifty/application/controller"
	"github.com/nirui/sshwifty/application/log"
)

func main() {
	configLoaders := make([]configuration.Loader, 0, 2)
	if cfgFile := configuration.GetEnv("SSHWIFTY_CONFIG"); len(cfgFile) > 0 {
		configLoaders = append(configLoaders, configuration.CustomFile(cfgFile))
	} else {
		configLoaders = append(configLoaders, configuration.DefaultFile())
		configLoaders = append(configLoaders, configuration.Environ())
	}
	e := application.
		New(os.Stderr, log.NewDebugOrNonDebugWriter(
			len(configuration.GetEnv("SSHWIFTY_DEBUG")) > 0,
			application.Name,
			os.Stderr,
		)).
		Run(configuration.Redundant(configLoaders...),
			application.DefaultProccessSignallerBuilder,
			commands.New(),
			controller.Builder,
		)
	if e == nil {
		return
	}
	os.Exit(1)
}
