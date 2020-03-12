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
	"github.com/niruix/sshwifty/application/log"
)

const (
	directTypeName = "Direct"
)

// Direct creates a loader that return raw configuration data directly.
// Good for integration.
func Direct(cfg Configuration) Loader {
	return func(log log.Logger) (string, Configuration, error) {
		return directTypeName, cfg, nil
	}
}
