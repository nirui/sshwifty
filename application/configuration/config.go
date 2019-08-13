// Sshwifty - A Web SSH client
//
// Copyright (C) 2019 Rui NI <nirui@gmx.com>
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
	"time"

	"github.com/niruix/sshwifty/application/network"
)

// Server contains configuration of a HTTP server
type Server struct {
	ListenInterface       string
	ListenPort            uint16
	InitialTimeout        time.Duration
	ReadTimeout           time.Duration
	WriteTimeout          time.Duration
	HeartbeatTimeout      time.Duration
	ReadDelay             time.Duration
	WriteDelay            time.Duration
	TLSCertificateFile    string
	TLSCertificateKeyFile string
}

func (s Server) defaultListenInterface() string {
	if len(s.ListenInterface) > 0 {
		return s.ListenInterface
	}

	return net.IPv4(127, 0, 0, 1).String()
}

func (s Server) defaultListenPort() uint16 {
	if s.ListenPort > 0 {
		return s.ListenPort
	}

	return 80
}

func (s Server) maxDur(cur, def time.Duration) time.Duration {
	if cur > def {
		return cur
	}

	return def
}

func (s Server) minDur(cur, def time.Duration) time.Duration {
	if cur < def {
		return cur
	}

	return def
}

// WithDefault build the configuration and fill the blank with default values
func (s Server) WithDefault() Server {
	initialTimeout := s.maxDur(s.InitialTimeout, 1*time.Second)

	readTimeout := s.maxDur(initialTimeout, 3*time.Second)
	readTimeout = s.maxDur(s.ReadTimeout, readTimeout)

	maxHeartBeatTimeout := time.Duration(float64(readTimeout) * 0.8)
	heartBeatTimeout := s.minDur(s.HeartbeatTimeout, maxHeartBeatTimeout)

	if heartBeatTimeout <= 0 {
		heartBeatTimeout = maxHeartBeatTimeout
	}

	return Server{
		ListenInterface:       s.defaultListenInterface(),
		ListenPort:            s.defaultListenPort(),
		InitialTimeout:        initialTimeout,
		ReadTimeout:           readTimeout,
		WriteTimeout:          s.maxDur(s.WriteTimeout, 3*time.Second),
		HeartbeatTimeout:      heartBeatTimeout,
		ReadDelay:             s.ReadDelay,
		WriteDelay:            s.WriteDelay,
		TLSCertificateFile:    s.TLSCertificateFile,
		TLSCertificateKeyFile: s.TLSCertificateKeyFile,
	}
}

// IsTLS returns whether or not TLS should be used
func (s Server) IsTLS() bool {
	return len(s.TLSCertificateFile) > 0 && len(s.TLSCertificateKeyFile) > 0
}

// Verify verifies current configuration
func (s Server) Verify() error {
	if net.ParseIP(s.ListenInterface) == nil {
		return fmt.Errorf("Invalid IP address \"%s\"", s.ListenInterface)
	}

	if (len(s.TLSCertificateFile) > 0 && len(s.TLSCertificateKeyFile) <= 0) ||
		(len(s.TLSCertificateFile) <= 0 && len(s.TLSCertificateKeyFile) > 0) {
		return errors.New("TLSCertificateFile and TLSCertificateKeyFile must " +
			"both be specified in order to enable TLS")
	}

	return nil
}

// Configuration contains configuration of the application
type Configuration struct {
	HostName    string
	SharedKey   string
	Dialer      network.Dial
	DialTimeout time.Duration
	Servers     []Server
}

// Common settings shared by mulitple servers
type Common struct {
	HostName    string
	SharedKey   string
	Dialer      network.Dial
	DialTimeout time.Duration
}

// Verify verifies current setting
func (c Configuration) Verify() error {
	if len(c.Servers) <= 0 {
		return errors.New("Must specify at least one server")
	}

	for i, c := range c.Servers {
		vErr := c.Verify()

		if vErr == nil {
			continue
		}

		return fmt.Errorf("Invalid setting for server %d: %s", i, vErr)
	}

	return nil
}

// Common returns common settings
func (c Configuration) Common() Common {
	dialer := c.Dialer

	if dialer == nil {
		dialer = network.TCPDial()
	}

	dialTimeout := c.DialTimeout

	if dialTimeout <= 1*time.Second {
		dialTimeout = 1 * time.Second
	}

	return Common{
		HostName:    c.HostName,
		SharedKey:   c.SharedKey,
		Dialer:      c.Dialer,
		DialTimeout: c.DialTimeout,
	}
}

// DecideDialTimeout will return a reasonable timeout for dialing
func (c Common) DecideDialTimeout(max time.Duration) time.Duration {
	if c.DialTimeout > max {
		return max
	}

	return c.DialTimeout
}
