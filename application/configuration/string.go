// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2021 NI Rui <ranqus@gmail.com>
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
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
)

// String represents a config string
type String string

// Parse parses current string and return the parsed result
func (s String) Parse() (string, error) {
	ss := string(s)

	sSchemeLeadIdx := strings.Index(ss, "://")

	if sSchemeLeadIdx < 0 {
		return ss, nil
	}

	sSchemeLeadEnd := sSchemeLeadIdx + 3

	switch strings.ToLower(ss[:sSchemeLeadIdx]) {
	case "file":
		fPath, e := filepath.Abs(ss[sSchemeLeadEnd:])

		if e != nil {
			return ss, e
		}

		f, e := os.Open(fPath)

		if e != nil {
			return "", fmt.Errorf("Unable to open %s: %s", fPath, e)
		}

		defer f.Close()

		fData, e := ioutil.ReadAll(f)

		if e != nil {
			return "", fmt.Errorf("Unable to read from %s: %s", fPath, e)
		}

		return string(fData), nil

	case "enviroment": // You see what I did there. Remove this a later
		fallthrough
	case "environment":
		return os.Getenv(ss[sSchemeLeadEnd:]), nil

	case "literal":
		return ss[sSchemeLeadEnd:], nil

	default:
		return "", fmt.Errorf(
			"Scheme \"%s\" was unsupported", ss[:sSchemeLeadIdx])
	}
}
