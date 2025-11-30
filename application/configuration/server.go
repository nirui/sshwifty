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
	"errors"
	"fmt"
	"net"
	"time"
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
	ServerMessage         string
}

// IsTLS returns whether or not TLS should be used
func (s Server) IsTLS() bool {
	return len(s.TLSCertificateFile) > 0 && len(s.TLSCertificateKeyFile) > 0
}

// verify verifies current configuration
func (s Server) verify() error {
	if net.ParseIP(s.ListenInterface) == nil {
		return fmt.Errorf("invalid IP address \"%s\"", s.ListenInterface)
	}
	if (len(s.TLSCertificateFile) > 0 && len(s.TLSCertificateKeyFile) <= 0) ||
		(len(s.TLSCertificateFile) <= 0 && len(s.TLSCertificateKeyFile) > 0) {
		return errors.New("TLSCertificateFile and TLSCertificateKeyFile must " +
			"both be specified in order to enable TLS")
	}
	return nil
}

// defaultListenInterface returns the default listening interface if the
// interface was unspecified
func (s Server) defaultListenInterface() string {
	if len(s.ListenInterface) <= 0 {
		return net.IPv4(127, 0, 0, 1).String()
	}
	return s.ListenInterface
}

// defaultListenPort returns the default listening port if the port was
// unspecified
func (s Server) defaultListenPort() uint16 {
	if s.ListenPort > 0 {
		return s.ListenPort
	}
	if s.IsTLS() {
		return 443
	}
	return 80
}

// Predefined variables for normalization
const (
	serverMinValidSecond       = 1 * time.Second
	heartbeatTimeoutProportion = 0.7
)

// normalize fills current Server with valid settings. If a setting is
// unspecified, it will be set with a reasonable default
func (s Server) normalize() Server {
	initialTimeout := atLeast(
		setZeroUintToDefault(s.InitialTimeout, 10*time.Second),
		serverMinValidSecond,
	)
	readTimeout := atLeast(
		setZeroUintToDefault(s.ReadTimeout, 60*time.Second),
		serverMinValidSecond,
	)
	writeTimeout := atLeast(
		setZeroUintToDefault(s.WriteTimeout, readTimeout),
		serverMinValidSecond,
	)
	heartBeatTimeout := clampRange(
		setZeroUintToDefault(s.HeartbeatTimeout, initialTimeout),
		time.Duration(float64(readTimeout)*heartbeatTimeoutProportion),
		serverMinValidSecond,
	)
	return Server{
		ListenInterface:       s.defaultListenInterface(),
		ListenPort:            s.defaultListenPort(),
		InitialTimeout:        initialTimeout,
		ReadTimeout:           readTimeout,
		WriteTimeout:          writeTimeout,
		HeartbeatTimeout:      heartBeatTimeout,
		ReadDelay:             atLeast(s.ReadDelay, 0),  // No less than 0
		WriteDelay:            atLeast(s.WriteDelay, 0), // No less than 0
		TLSCertificateFile:    s.TLSCertificateFile,
		TLSCertificateKeyFile: s.TLSCertificateKeyFile,
		ServerMessage:         s.ServerMessage,
	}
}
