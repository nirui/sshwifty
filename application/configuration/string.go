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

package configuration

import (
	"fmt"

	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	environRenamePrefix    = "SSHWIFTY_ENV_RENAMED:"
	environRenamePrefixLen = len(environRenamePrefix)
)

// GetEnv returns the environment variable by given `name`
func GetEnv(name string) string {
	if v := os.Getenv(name); !strings.HasPrefix(v, environRenamePrefix) {
		return v
	} else {
		return os.Getenv(v[environRenamePrefixLen:])
	}
}

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
			return "", fmt.Errorf("unable to open %s: %s", fPath, e)
		}
		defer f.Close()
		fData, e := io.ReadAll(f)
		if e != nil {
			return "", fmt.Errorf("unable to read from %s: %s", fPath, e)
		}
		return string(fData), nil
	case "environment":
		return GetEnv(ss[sSchemeLeadEnd:]), nil
	case "literal":
		return ss[sSchemeLeadEnd:], nil
	default:
		return "", fmt.Errorf(
			"scheme \"%s\" was unsupported", ss[:sSchemeLeadIdx])
	}
}
