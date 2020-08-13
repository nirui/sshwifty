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

	case "enviroment":
		return os.Getenv(ss[sSchemeLeadEnd:]), nil

	case "literal":
		return ss[sSchemeLeadEnd:], nil

	default:
		return "", fmt.Errorf(
			"Scheme \"%s\" was unsupported", ss[:sSchemeLeadIdx])
	}
}
