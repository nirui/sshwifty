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
	"errors"
	"fmt"
	"time"

	"github.com/Snuffy2/sshwifty/application/network"
)

// Configuration is the top-level application configuration produced by a
// Loader. It aggregates global settings, server definitions, preset endpoints,
// hook rules, and optional SOCKS5 proxy credentials. Use Verify to validate
// the values before using the configuration.
type Configuration struct {
	HostName               string
	SharedKey              string
	DialTimeout            time.Duration
	Socks5                 string
	Socks5User             string
	Socks5Password         string
	Hooks                  Hooks
	HookTimeout            time.Duration
	Servers                []Server
	Presets                []Preset
	OnlyAllowPresetRemotes bool
}

// Verify verifies current setting
func (c Configuration) Verify() error {
	if err := c.Hooks.verify(); err != nil {
		return fmt.Errorf("invalid Hook settings: %s", err)
	}
	if len(c.Servers) <= 0 {
		return errors.New("must specify at least one server")
	}
	for i, c := range c.Servers {
		if vErr := c.verify(); vErr == nil {
			continue
		} else {
			return fmt.Errorf("invalid setting for server %d: %s", i, vErr)
		}
	}
	return nil
}

// Dialer constructs and returns the network.Dial function for this
// configuration. When a SOCKS5 proxy is specified it wraps a plain TCP dialer.
// When OnlyAllowPresetRemotes is true it additionally wraps the dialer in an
// access-control layer that restricts connections to preset hosts.
func (c Configuration) Dialer() network.Dial {
	d := network.TCPDial()
	if len(c.Socks5) > 0 {
		d = network.BuildSocks5Dial(c.Socks5, c.Socks5User, c.Socks5Password, d)
	}
	if c.OnlyAllowPresetRemotes {
		accessList := make(network.AllowedHosts, len(c.Presets))
		for _, k := range c.Presets {
			if len(k.Host) <= 0 {
				continue
			}
			accessList[k.Host] = struct{}{}
		}
		d = network.AccessControlDial(accessList, d)
	}
	return d
}

// hookSettings converts the configuration's Hooks and HookTimeout fields into
// a HookSettings value suitable for passing to the command layer.
func (c Configuration) hookSettings() HookSettings {
	return HookSettings{
		Timeout: c.HookTimeout,
		Hooks:   c.Hooks,
	}
}

// Common derives the Common settings struct from the Configuration, building
// the Dialer and HookSettings in the process.
func (c Configuration) Common() Common {
	return Common{
		HostName:               c.HostName,
		SharedKey:              c.SharedKey,
		Dialer:                 c.Dialer(),
		DialTimeout:            c.DialTimeout,
		Presets:                c.Presets,
		Hooks:                  c.hookSettings(),
		OnlyAllowPresetRemotes: c.OnlyAllowPresetRemotes,
	}
}

// DecideDialTimeout returns the effective dial timeout clamped to the given
// maximum. If DialTimeout is zero or negative it falls through to max.
func (c Common) DecideDialTimeout(max time.Duration) time.Duration {
	return clampRange(c.DialTimeout, max, 0)
}
