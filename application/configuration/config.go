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
	"net"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
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
	PinnedSSHFingerprints  map[string]string
	Servers                []Server
	Presets                []Preset
	OnlyAllowPresetRemotes bool
}

var (
	hostnameVerifier = regexp.MustCompile(`(?i)^([a-z0-9\-\.]+)(:[0-9]+){0,1}$`)
)

func GetValidHostName(
	host string,
	omitPort uint16,
) (addr string, portOmitted bool, valid bool) {
	ip, err := netip.ParseAddrPort(host)
	if err == nil {
		if ip.Port() == omitPort { // "ip:omitPort"
			return ip.Addr().String(), true, true
		}
		return ip.String(), false, true // "ip:otherPort"
	}
	if !hostnameVerifier.Match([]byte(host)) {
		return "", false, false
	}
	if !strings.Contains(host, ":") { // Address look like "localhost"
		return host, true, true
	}
	// Address look like "localhost:port" from now on
	hostname, port, err := net.SplitHostPort(host)
	if err != nil {
		return "", false, false
	}
	if p, ok := strconv.ParseUint(
		port,
		10,
		16,
	); ok == nil && uint16(p) == omitPort {
		return hostname, true, true
	}
	return host, false, true
}

const (
	SSHOmitPort    = 22
	SSHOmitPortStr = "22"
)

func (c Configuration) verifyPinnedSSHFingerprint(
	dummyTo *SSHHostFingerprints,
	hosts string,
	fingerprint string,
) error {
	if !isSupportedSSHFingerprint(fingerprint) {
		return fmt.Errorf("%q is not an acceptable fingerprint", fingerprint)
	}
	for host := range strings.SplitSeq(hosts, ",") {
		h, _, valid := GetValidHostName(host, SSHOmitPort)
		if valid {
			dummyTo.add(fingerprint, h)
			continue
		}
		return fmt.Errorf("%q is not an acceptable hostname", host)
	}
	return nil
}

func (c Configuration) verifyPreset(
	dummyFPS SSHHostFingerprints,
	p Preset,
) error {
	switch strings.ToUpper(p.Type) {
	case "SSH":
		host, portOmitted, valid := GetValidHostName(p.Host, SSHOmitPort)
		if !valid {
			return fmt.Errorf("invalid format for hostname %q", p.Host)
		}
		hosts := []string{host}
		if portOmitted {
			hosts = append(hosts, net.JoinHostPort(host, SSHOmitPortStr))
		}
		fp, hasFPS := p.Meta["Fingerprint"]
		if !hasFPS {
			return nil
		}
		validFPS, hasFPS := dummyFPS.Get(hosts...)
		if !hasFPS || validFPS.Has(fp) {
			return nil
		}
		return fmt.Errorf("the meta setting `Fingerprint` for this Preset " +
			"does not match the one defined in the `PinnedSSHFingerprints` " +
			"setting for the same host")
	case "TELNET":
		_, _, valid := GetValidHostName(p.Host, SSHOmitPort)
		if !valid {
			return fmt.Errorf("invalid format for hostname %q", p.Host)
		}
		return nil
	default:
		return fmt.Errorf("%q is an unsupported preset type", p.Type)
	}
}

// Verify verifies current setting
func (c Configuration) Verify() error {
	if err := c.Hooks.verify(); err != nil {
		return fmt.Errorf("invalid Hook settings: %s", err)
	}
	if len(c.Servers) <= 0 {
		return errors.New("must specify at least one server")
	}
	dummyFPS := make(SSHHostFingerprints, len(c.PinnedSSHFingerprints))
	for h, f := range c.PinnedSSHFingerprints {
		if vErr := c.verifyPinnedSSHFingerprint(&dummyFPS, h, f); vErr == nil {
			continue
		} else {
			return fmt.Errorf(
				"invalid setting for Pinned SSH Fingerprint for host(s) "+
					"%q: %q: %s",
				h,
				f,
				vErr,
			)
		}
	}
	for i, c := range c.Servers {
		if vErr := c.verify(); vErr == nil {
			continue
		} else {
			return fmt.Errorf("invalid setting for server %d: %s", i, vErr)
		}
	}
	for i, p := range c.Presets {
		if vErr := c.verifyPreset(dummyFPS, p); vErr == nil {
			continue
		} else {
			return fmt.Errorf("invalid setting for preset %d: %s", i, vErr)
		}
	}
	return nil
}

// Dialer builds a Dialer
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

// hookSettings returns Hooks settings
func (c Configuration) hookSettings() HookSettings {
	return HookSettings{
		Timeout: c.HookTimeout,
		Hooks:   c.Hooks,
	}
}

func (c Configuration) getPinnedSSHFingerprints() SSHHostFingerprints {
	fps := make(SSHHostFingerprints, len(c.PinnedSSHFingerprints))
	for hosts, fingerprint := range c.PinnedSSHFingerprints {
		if !isSupportedSSHFingerprint(fingerprint) {
			panic("invalid SSH pinned fingerprint")
		}
		for host := range strings.SplitSeq(hosts, ",") {
			h, portOmitted, valid := GetValidHostName(host, SSHOmitPort)
			if !valid {
				panic("invalid SSH pinned host")
			}
			fps.add(fingerprint, h)
			// Add the host:port format as well just be safe. The command.SSH
			// uses the `host:port` format for hostname
			if portOmitted {
				fps.add(fingerprint, net.JoinHostPort(h, SSHOmitPortStr))
			}
		}
	}
	return fps
}

// Common returns common settings
func (c Configuration) Common() Common {
	return Common{
		HostName:               c.HostName,
		SharedKey:              c.SharedKey,
		Dialer:                 c.Dialer(),
		DialTimeout:            c.DialTimeout,
		Presets:                c.Presets,
		PinnedSSHFingerprints:  c.getPinnedSSHFingerprints(),
		Hooks:                  c.hookSettings(),
		OnlyAllowPresetRemotes: c.OnlyAllowPresetRemotes,
	}
}

// DecideDialTimeout will return a reasonable timeout for dialing
func (c Common) DecideDialTimeout(max time.Duration) time.Duration {
	return clampRange(c.DialTimeout, max, 0)
}
