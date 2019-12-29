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

package configuration

import (
	"fmt"

	"github.com/niruix/sshwifty/application/log"
)

const (
	redundantTypeName = "Redundant"
)

// Redundant creates a group of loaders. They will be executed one by one until
// one of it successfully returned a configuration
func Redundant(loaders ...Loader) Loader {
	return func(log log.Logger) (string, Configuration, error) {
		ll := log.Context("Redundant")

		for i := range loaders {
			lLoaderName, lCfg, lErr := loaders[i](ll)

			if lErr != nil {
				ll.Warning("Unable to load configuration from \"%s\": %s",
					lLoaderName, lErr)

				continue
			}

			return lLoaderName, lCfg, nil
		}

		return redundantTypeName, Configuration{}, fmt.Errorf(
			"All existing redundant loader has failed")
	}
}
