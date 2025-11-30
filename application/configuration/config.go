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

	"github.com/nirui/sshwifty/application/network"
)

// Configuration contains configuration of the application
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

// Dialer builds a Dialer
func (c Configuration) Dialer() network.Dial {
	d := network.TCPDial()
	if len(c.Socks5) > 0 {
		d = network.BuildSocks5Dial(d, c.Socks5, c.Socks5User, c.Socks5Password)
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

// hookSettings returns Hooks settings
func (c Configuration) hookSettings() HookSettings {
	return HookSettings{
		Timeout: c.HookTimeout,
		Hooks:   c.Hooks,
	}
}

// Common returns common settings
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

// DecideDialTimeout will return a reasonable timeout for dialing
func (c Common) DecideDialTimeout(max time.Duration) time.Duration {
	return clampRange(c.DialTimeout, max, 0)
}
