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

import "fmt"

// Meta contains data of a Key -> Value map which can be use to store
// dynamically structured configuration options
type Meta map[string]String

// Concretize returns an concretized Meta as a `map[string]string`
func (m Meta) Concretize() (mm map[string]string, err error) {
	mm = make(map[string]string, len(m))
	for k, v := range m {
		var result string
		if result, err = v.Parse(); err != nil {
			err = fmt.Errorf("unable to parse Meta \"%s\": %s", k, err)
			return
		}
		mm[k] = result
	}
	return
}
