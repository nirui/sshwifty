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

// Server holds the fully resolved configuration for a single HTTP(S) listener.
// Use serverInput.concretize() to produce a normalised Server; use verify() to
// validate one before passing it to the server layer.
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

// IsTLS returns true when both TLSCertificateFile and TLSCertificateKeyFile are
// non-empty, indicating that the server should use HTTPS.
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

// defaultListenInterface returns ListenInterface when non-empty, or the
// loopback address 127.0.0.1 when ListenInterface was left unspecified.
func (s Server) defaultListenInterface() string {
	if len(s.ListenInterface) <= 0 {
		return net.IPv4(127, 0, 0, 1).String()
	}
	return s.ListenInterface
}

// defaultListenPort returns ListenPort when non-zero, or the protocol-specific
// default: 443 for TLS and 80 for plain HTTP.
func (s Server) defaultListenPort() uint16 {
	if s.ListenPort > 0 {
		return s.ListenPort
	}
	if s.IsTLS() {
		return 443
	}
	return 80
}

// serverMinValidSecond is the minimum acceptable value for any timeout field; it
// prevents pathological configurations with zero or sub-second timeouts.
// maxHeartbeatTimeoutProportion caps the heartbeat timeout at 70% of the read
// timeout to ensure heartbeats fire before the read timeout can close the
// connection.
const (
	serverMinValidSecond          = 1 * time.Second
	maxHeartbeatTimeoutProportion = 0.7
)

// normalize fills unspecified Server fields with safe defaults and clamps all
// timeout values within acceptable bounds. It returns a new Server with all
// fields populated.
func (s Server) normalize() Server {
	initialTimeout := atLeast(
		setZeroUintToDefault(s.InitialTimeout, 10*time.Second),
		serverMinValidSecond,
	)
	readTimeout := atLeast(
		setZeroUintToDefault(s.ReadTimeout, 120*time.Second),
		serverMinValidSecond,
	)
	writeTimeout := atLeast(
		setZeroUintToDefault(s.WriteTimeout, readTimeout),
		serverMinValidSecond,
	)
	heartbeatTimeout := clampRange(
		setZeroUintToDefault(s.HeartbeatTimeout, initialTimeout),
		time.Duration(float64(readTimeout)*maxHeartbeatTimeoutProportion),
		serverMinValidSecond,
	)
	return Server{
		ListenInterface:       s.defaultListenInterface(),
		ListenPort:            s.defaultListenPort(),
		InitialTimeout:        initialTimeout,
		ReadTimeout:           readTimeout,
		WriteTimeout:          writeTimeout,
		HeartbeatTimeout:      heartbeatTimeout,
		ReadDelay:             atLeast(s.ReadDelay, 0),  // No less than 0
		WriteDelay:            atLeast(s.WriteDelay, 0), // No less than 0
		TLSCertificateFile:    s.TLSCertificateFile,
		TLSCertificateKeyFile: s.TLSCertificateKeyFile,
		ServerMessage:         s.ServerMessage,
	}
}
