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
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"

	"github.com/nirui/sshwifty/application/log"
)

const (
	fileTypeName = "File"
)

func loadFile(filePath string) (string, Configuration, error) {
	f, fErr := os.Open(filePath)
	if fErr != nil {
		return fileTypeName, Configuration{}, fErr
	}
	defer f.Close()
	cfg := commonInput{}
	jDecoder := json.NewDecoder(f)
	jDecodeErr := jDecoder.Decode(&cfg)
	if jDecodeErr != nil {
		return fileTypeName, Configuration{}, jDecodeErr
	}
	finalCfg, err := cfg.concretize()
	return fileTypeName, finalCfg, err
}

// CustomFile creates a configuration file loader that loads configuration from
// the specified file path
func CustomFile(customPath string) Loader {
	return func(log log.Logger) (string, Configuration, error) {
		log.Info("Loading configuration from: %s", customPath)
		return loadFile(customPath)
	}
}

// DefaultFile creates a configuration file loader that loads configuration from
// one of the default file path
func DefaultFile() Loader {
	return func(log log.Logger) (string, Configuration, error) {
		log.Info("Loading configuration from one of the default " +
			"configuration files ...")
		fallbackFileSearchList := make([]string, 0, 3)

		// ~/.config/sshwifty.conf.json
		if u, userErr := user.Current(); userErr == nil {
			fallbackFileSearchList = append(
				fallbackFileSearchList,
				filepath.Join(u.HomeDir, ".config", "sshwifty.conf.json"))
		}

		// /etc/sshwifty.conf.json
		fallbackFileSearchList = append(
			fallbackFileSearchList,
			filepath.Join("/", "etc", "sshwifty.conf.json"),
		)

		// sshwifty.conf.json located at the same directory as Sshwifty bin
		if ex, exErr := os.Executable(); exErr == nil {
			fallbackFileSearchList = append(
				fallbackFileSearchList,
				filepath.Join(filepath.Dir(ex), "sshwifty.conf.json"))
		}

		// Search given locations to select the config file
		for f := range fallbackFileSearchList {
			if fInfo, fErr := os.Stat(fallbackFileSearchList[f]); fErr != nil {
				continue
			} else if fInfo.IsDir() {
				continue
			} else {
				log.Info("Configuration file \"%s\" has been selected",
					fallbackFileSearchList[f])
				return loadFile(fallbackFileSearchList[f])
			}
		}
		return fileTypeName, Configuration{}, fmt.Errorf(
			"Configuration file was not specified. Also tried fallback files "+
				"\"%s\", but none of them was available",
			strings.Join(fallbackFileSearchList, "\", \""))
	}
}
