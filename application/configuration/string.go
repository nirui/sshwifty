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

// environRenamePrefix is the sentinel value prefix that, when found at the
// start of an environment variable's value, causes GetEnv to treat the
// remainder as the name of a second variable to look up instead.
// environRenamePrefixLen caches the length of the prefix.
const (
	environRenamePrefix    = "SSHWIFTY_ENV_RENAMED:"
	environRenamePrefixLen = len(environRenamePrefix)
)

// GetEnv looks up the environment variable named name. If the variable's value
// starts with SSHWIFTY_ENV_RENAMED: the remainder is treated as an alias and
// the alias variable is returned instead, supporting secret injection via
// environment variable indirection.
func GetEnv(name string) string {
	if v := os.Getenv(name); !strings.HasPrefix(v, environRenamePrefix) {
		return v
	} else {
		return os.Getenv(v[environRenamePrefixLen:])
	}
}

// String is a configuration string that may contain a URI scheme to indicate
// how its value should be resolved. Plain strings are returned as-is; strings
// beginning with "file://", "environment://", or "literal://" are resolved
// through their respective sources.
type String string

// Parse resolves the configuration string and returns the final string value.
// Supported schemes:
//   - file://path    reads the file at path and returns its contents as a string.
//   - environment://name returns the value of the named environment variable.
//   - literal://value returns value verbatim, preserving any embedded "://" sequences.
//
// Strings without a recognised scheme are returned unchanged. Unknown schemes
// return an error.
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
