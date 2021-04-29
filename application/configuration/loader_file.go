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
	"encoding/json"
	"fmt"
	"os"
	"os/user"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/nirui/sshwifty/application/log"
)

const (
	fileTypeName = "File"
)

type fileCfgServer struct {
	ListenInterface       string // Interface to listen to
	ListenPort            uint16 // Port to listen
	InitialTimeout        int    // Client initial request timeout, in second
	ReadTimeout           int    // Read operation timeout, in second
	WriteTimeout          int    // Write operation timeout, in second
	HeartbeatTimeout      int    // Client heartbeat interval, in second
	ReadDelay             int    // Read delay, in millisecond
	WriteDelay            int    // Write delay, in millisecond
	TLSCertificateFile    string // Location of TLS certificate file
	TLSCertificateKeyFile string // Location of TLS certificate key
}

func (f *fileCfgServer) build() Server {
	iface := f.ListenInterface

	if len(iface) <= 0 {
		iface = "127.0.0.1"
	}

	return Server{
		ListenInterface: iface,
		ListenPort:      f.ListenPort,
		InitialTimeout: time.Duration(
			durationAtLeast(f.InitialTimeout, 5)) * time.Second,
		ReadTimeout: time.Duration(
			durationAtLeast(f.ReadTimeout, 30)) * time.Second,
		WriteTimeout: time.Duration(
			durationAtLeast(f.WriteTimeout, 30)) * time.Second,
		HeartbeatTimeout: time.Duration(
			durationAtLeast(f.HeartbeatTimeout, 10)) * time.Second,
		ReadDelay: time.Duration(
			durationAtLeast(f.ReadDelay, 0)) * time.Millisecond,
		WriteDelay: time.Duration(
			durationAtLeast(f.WriteDelay, 0)) * time.Millisecond,
		TLSCertificateFile:    f.TLSCertificateFile,
		TLSCertificateKeyFile: f.TLSCertificateKeyFile,
	}
}

type fileCfgPreset struct {
	Title string
	Type  string
	Host  string
	Meta  Meta
}

func (f fileCfgPreset) concretize() (Preset, error) {
	m, err := f.Meta.Concretize()

	if err != nil {
		return Preset{}, err
	}

	return Preset{
		Title: f.Title,
		Type:  strings.TrimSpace(f.Type),
		Host:  f.Host,
		Meta:  m,
	}, nil
}

type fileCfgPresets []fileCfgPreset

func (f fileCfgPresets) concretize() ([]Preset, error) {
	ps := make([]Preset, 0, len(f))

	for i, p := range f {
		pp, err := p.concretize()

		if err != nil {
			return nil, fmt.Errorf(
				"Unable to concretize Preset %d (titled \"%s\"): %s",
				i+1, p.Title, err)
		}

		ps = append(ps, pp)
	}

	return ps, nil
}

type fileCfgCommon struct {
	// Host name
	HostName string

	// Shared key, empty to enable public access
	SharedKey string

	// DialTimeout, min 5s
	DialTimeout int

	// Socks5 server address, optional
	Socks5 string

	// Login user for socks5 server, optional
	Socks5User string

	// Login pass for socks5 server, optional
	Socks5Password string

	// Servers
	Servers []*fileCfgServer

	// Remotes
	Presets fileCfgPresets

	// Allow predefined remotes only
	OnlyAllowPresetRemotes bool
}

func (f fileCfgCommon) build() (fileCfgCommon, error) {
	return fileCfgCommon{
		HostName:               f.HostName,
		SharedKey:              f.SharedKey,
		DialTimeout:            durationAtLeast(f.DialTimeout, 5),
		Socks5:                 f.Socks5,
		Socks5User:             f.Socks5User,
		Socks5Password:         f.Socks5Password,
		Servers:                f.Servers,
		Presets:                f.Presets,
		OnlyAllowPresetRemotes: f.OnlyAllowPresetRemotes,
	}, nil
}

func loadFile(filePath string) (string, Configuration, error) {
	f, fErr := os.Open(filePath)

	if fErr != nil {
		return fileTypeName, Configuration{}, fErr
	}

	defer f.Close()

	cfg := fileCfgCommon{}

	jDecoder := json.NewDecoder(f)
	jDecodeErr := jDecoder.Decode(&cfg)

	if jDecodeErr != nil {
		return fileTypeName, Configuration{}, jDecodeErr
	}

	finalCfg, cfgErr := cfg.build()

	if cfgErr != nil {
		return fileTypeName, Configuration{}, cfgErr
	}

	servers := make([]Server, len(finalCfg.Servers))

	for i := range servers {
		servers[i] = finalCfg.Servers[i].build()
	}

	presets, err := finalCfg.Presets.concretize()

	if err != nil {
		return fileTypeName, Configuration{}, err
	}

	return fileTypeName, Configuration{
		HostName:  finalCfg.HostName,
		SharedKey: finalCfg.SharedKey,
		DialTimeout: time.Duration(finalCfg.DialTimeout) *
			time.Second,
		Socks5:                 cfg.Socks5,
		Socks5User:             cfg.Socks5User,
		Socks5Password:         cfg.Socks5Password,
		Servers:                servers,
		Presets:                presets,
		OnlyAllowPresetRemotes: cfg.OnlyAllowPresetRemotes,
	}, nil
}

// File creates a configuration file loader
func File(customPath string) Loader {
	return func(log log.Logger) (string, Configuration, error) {
		if len(customPath) > 0 {
			log.Info("Loading configuration from: %s", customPath)

			return loadFile(customPath)
		}

		log.Info("Loading configuration from one of the default " +
			"configuration files ...")

		fallbackFileSearchList := make([]string, 0, 3)

		// ~/.config/sshwifty.conf.json
		u, userErr := user.Current()
		if userErr == nil {
			fallbackFileSearchList = append(
				fallbackFileSearchList,
				path.Join(u.HomeDir, ".config", "sshwifty.conf.json"))
		}

		// /etc/sshwifty.conf.json
		fallbackFileSearchList = append(
			fallbackFileSearchList, "/etc/sshwifty.conf.json")

		// sshwifty.conf.json located at the same directory as Sshwifty bin
		ex, exErr := os.Executable()
		if exErr == nil {
			fallbackFileSearchList = append(
				fallbackFileSearchList,
				path.Join(filepath.Dir(ex), "sshwifty.conf.json"))
		}

		for f := range fallbackFileSearchList {
			fInfo, fErr := os.Stat(fallbackFileSearchList[f])

			if fErr != nil {
				continue
			}

			if fInfo.IsDir() {
				continue
			}

			log.Info("Configuration file \"%s\" has been selected",
				fallbackFileSearchList[f])

			return loadFile(fallbackFileSearchList[f])
		}

		return fileTypeName, Configuration{}, fmt.Errorf(
			"Configuration file was not specified. Also tried fallback files "+
				"\"%s\", but none of it was available",
			strings.Join(fallbackFileSearchList, "\", \""))
	}
}
