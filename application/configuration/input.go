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

import (
	"fmt"
	"strings"
	"time"
)

// serverInput holds raw user-supplied values for a single HTTP server instance
// before they have been validated and converted to concrete types. Integer
// timeouts are expressed in seconds; delays are expressed in milliseconds.
type serverInput struct {
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
	ServerMessage         string // Server message displayed on the Home page
}

// concretize converts the raw serverInput into a normalised Server by applying
// default values, converting integer seconds/milliseconds to time.Duration, and
// calling Server.normalize.
func (f *serverInput) concretize() Server {
	return Server{
		ListenInterface:       f.ListenInterface,
		ListenPort:            f.ListenPort,
		InitialTimeout:        time.Duration(f.InitialTimeout) * time.Second,
		ReadTimeout:           time.Duration(f.ReadTimeout) * time.Second,
		WriteTimeout:          time.Duration(f.WriteTimeout) * time.Second,
		HeartbeatTimeout:      time.Duration(f.HeartbeatTimeout) * time.Second,
		ReadDelay:             time.Duration(f.ReadDelay) * time.Millisecond,
		WriteDelay:            time.Duration(f.WriteDelay) * time.Millisecond,
		TLSCertificateFile:    f.TLSCertificateFile,
		TLSCertificateKeyFile: f.TLSCertificateKeyFile,
		ServerMessage:         f.ServerMessage,
	}.normalize()
}

// serverInputs is an ordered list of serverInput values, each corresponding to
// one HTTP server definition in the configuration source.
type serverInputs []serverInput

// concretize validates and converts every serverInput in f into a Server. It
// returns an error if the slice is empty (at least one server is required) or
// if any individual server fails verification.
func (f serverInputs) concretize() ([]Server, error) {
	if len(f) <= 0 {
		return nil, fmt.Errorf("at least one Server must be specified")
	}
	ss := make([]Server, 0, len(f))
	for i, s := range f {
		v := s.concretize()
		if err := v.verify(); err != nil {
			return nil, fmt.Errorf(
				"invalid setting for Server %d: %s",
				i+1,
				err,
			)
		} else {
			ss = append(ss, v)
		}
	}
	return ss, nil
}

// presetInput holds raw user-supplied values for a single preset endpoint
// before Meta values have been parsed through the String scheme resolver.
type presetInput struct {
	Title    string
	Type     string
	Host     string
	TabColor string
	Meta     Meta
}

// concretize resolves all Meta values through the String scheme resolver and
// returns a concrete Preset. It returns an error if any Meta value cannot be
// parsed.
func (f presetInput) concretize() (Preset, error) {
	m, err := f.Meta.Concretize()
	if err != nil {
		return Preset{}, err
	}
	return Preset{
		Title:    f.Title,
		Type:     strings.TrimSpace(f.Type),
		Host:     f.Host,
		TabColor: strings.TrimSpace(f.TabColor),
		Meta:     m,
	}, nil
}

// presetInputs is an ordered list of presetInput values corresponding to the
// preset entries in the configuration source.
type presetInputs []presetInput

// concretize converts each presetInput in f into a Preset, collecting the
// first error encountered with a human-readable index and title.
func (f presetInputs) concretize() ([]Preset, error) {
	ps := make([]Preset, 0, len(f))
	for i, p := range f {
		pp, err := p.concretize()
		if err != nil {
			return nil, fmt.Errorf(
				"invalid Preset for %d (titled \"%s\"): %s",
				i+1, p.Title, err)
		}
		ps = append(ps, pp)
	}
	return ps, nil
}

// commonInput is the top-level raw configuration struct decoded from a JSON
// file or environment variables. All numeric timeouts are in seconds or
// milliseconds and are converted to time.Duration by concretize.
type commonInput struct {
	// Host name
	HostName string

	// Shared key, empty to enable public access
	SharedKey string

	// DialTimeout, default 5s
	DialTimeout int

	// Socks5 server address, optional
	Socks5 string

	// Login user for socks5 server, optional
	Socks5User string

	// Login pass for socks5 server, optional
	Socks5Password string

	// Hooks, default 1s
	Hooks Hooks

	// HookTimeout execution timeout
	HookTimeout int

	// Servers
	Servers serverInputs

	// Remotes
	Presets presetInputs

	// Allow predefined remotes only
	OnlyAllowPresetRemotes bool
}

// concretize validates and converts the raw commonInput into a Configuration,
// applying defaults for zero-valued numeric fields and propagating errors from
// hook validation and server/preset concretisation.
func (f commonInput) concretize() (Configuration, error) {
	if err := f.Hooks.verify(); err != nil {
		return Configuration{}, err
	}
	servers, err := f.Servers.concretize()
	if err != nil {
		return Configuration{}, err
	}
	presets, err := f.Presets.concretize()
	if err != nil {
		return Configuration{}, err
	}
	return Configuration{
		HostName:  f.HostName,
		SharedKey: f.SharedKey,
		DialTimeout: time.Duration(setZeroUintToDefault(
			f.DialTimeout,
			5,
		)) * time.Second,
		Socks5:         f.Socks5,
		Socks5User:     f.Socks5User,
		Socks5Password: f.Socks5Password,
		Hooks:          f.Hooks,
		HookTimeout: time.Duration(setZeroUintToDefault(
			f.HookTimeout,
			1,
		)) * time.Second,
		Servers:                servers,
		Presets:                presets,
		OnlyAllowPresetRemotes: f.OnlyAllowPresetRemotes,
	}, nil
}
