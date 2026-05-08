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

package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	goLog "log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/Snuffy2/sshwifty/application/command"
	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
)

// loggerWriter adapts a log.Logger to io.Writer so that the standard library's
// http.Server error logger can route messages through the application logger.
// Whitespace is trimmed from each write before forwarding.
type loggerWriter struct {
	// l is the application logger that receives the HTTP server error messages.
	l log.Logger
}

// Write trims surrounding whitespace from b and forwards it to the logger's
// Write method.
func (d loggerWriter) Write(b []byte) (int, error) {
	return d.l.Write(bytes.TrimSpace(b))
}

// ErrInvalidIPAddress is returned by buildListener when the configured
// ListenInterface is not a valid IP address string.
var (
	ErrInvalidIPAddress = errors.New(
		"invalid IP address")
)

// HandlerBuilder is a factory for the http.Handler used by a single server
// instance. It receives the shared Common configuration, the per-server
// configuration, and a logger scoped to that server.
type HandlerBuilder func(
	commonCfg configuration.Common,
	cfg configuration.Server,
	logger log.Logger) http.Handler

// HandlerBuilderBuilder returns a HandlerBuilder that has been configured with
// the full set of registered commands. It is called once per Server.Serve
// invocation.
type HandlerBuilderBuilder func(command.Commands) HandlerBuilder

// CloseCallback is called by a Serving goroutine when it exits, passing the
// error that caused the exit (or nil on clean shutdown).
type CloseCallback func(error)

// Server is the factory type that creates and tracks Serving instances. It
// holds the shared logger and a WaitGroup used to wait for all servers to stop.
type Server struct {
	// logger is the application logger used to create per-server child loggers.
	logger log.Logger
	// shutdownWait is decremented by each Serving goroutine when it exits.
	shutdownWait *sync.WaitGroup
}

// Serving wraps an active http.Server and the shared WaitGroup. Its Close
// method triggers a graceful shutdown.
type Serving struct {
	// server is the underlying HTTP server being served.
	server http.Server
	// shutdownWait is the shared WaitGroup decremented on server exit.
	shutdownWait *sync.WaitGroup
}

// New creates a new Server builder
func New(logger log.Logger) Server {
	return Server{
		logger:       logger,
		shutdownWait: &sync.WaitGroup{},
	}
}

// Serve constructs an http.Server with the given configuration, starts a
// listener goroutine, and returns the Serving handle immediately. closeCallback
// is invoked from the goroutine when it exits. handlerBuilder is called to
// produce the HTTP handler for this server instance.
func (s Server) Serve(
	commonCfg configuration.Common,
	cfg configuration.Server,
	closeCallback CloseCallback,
	handlerBuilder HandlerBuilder,
) *Serving {
	l := s.logger.TitledContext(
		"Server (%s:%d)",
		cfg.ListenInterface,
		cfg.ListenPort,
	)
	l.Debug("Settings=%+v", cfg)
	ss := &Serving{
		server: http.Server{
			Handler:           handlerBuilder(commonCfg, cfg, l),
			TLSConfig:         &tls.Config{MinVersion: tls.VersionTLS12},
			ReadTimeout:       cfg.ReadTimeout,
			ReadHeaderTimeout: cfg.InitialTimeout,
			WriteTimeout:      cfg.WriteTimeout,
			IdleTimeout:       cfg.ReadTimeout,
			MaxHeaderBytes:    http.DefaultMaxHeaderBytes,
			ErrorLog:          goLog.New(loggerWriter{l: l}, "", 0),
		},
		shutdownWait: s.shutdownWait,
	}
	s.shutdownWait.Add(1)
	go ss.run(l, cfg, closeCallback)
	return ss
}

// Wait blocks until all Serving goroutines started by this Server have exited.
func (s Server) Wait() {
	s.shutdownWait.Wait()
}

// buildListener resolves the IP/port pair, opens a TCP listener, and wraps it
// in a listener that enforces per-connection timeouts.
func (s *Serving) buildListener(
	ip string,
	port uint16,
	readTimeout time.Duration,
	writeTimeout time.Duration,
) (listener, error) {
	ipAddr := net.ParseIP(ip)
	if ipAddr == nil {
		return listener{}, ErrInvalidIPAddress
	}
	ipPort := net.JoinHostPort(
		ipAddr.String(), strconv.FormatInt(int64(port), 10))
	addr, addrErr := net.ResolveTCPAddr("tcp", ipPort)
	if addrErr != nil {
		return listener{}, addrErr
	}
	ll, llErr := net.ListenTCP("tcp", addr)
	if llErr != nil {
		return listener{}, llErr
	}
	return listener{
		TCPListener:  ll,
		readTimeout:  readTimeout,
		writeTimeout: writeTimeout,
	}, nil
}

// run starts the server
func (s *Serving) run(
	logger log.Logger,
	cfg configuration.Server,
	closeCallback CloseCallback,
) error {
	var err error
	defer func() {
		if err == nil || err == http.ErrServerClosed {
			logger.Info("Closed")
		} else {
			logger.Warning("Failed to serve due to error: %s", err)
		}
		s.shutdownWait.Done()
		closeCallback(err)
	}()
	var ls listener
	ls, err = s.buildListener(
		cfg.ListenInterface,
		cfg.ListenPort,
		cfg.ReadTimeout,
		cfg.WriteTimeout,
	)
	if err != nil {
		return err
	}
	defer ls.Close()
	if !cfg.IsTLS() {
		logger.Info("Serving")
		err = s.server.Serve(ls)
	} else {
		logger.Info("Serving TLS")
		err = s.server.ServeTLS(
			ls, cfg.TLSCertificateFile, cfg.TLSCertificateKeyFile)
	}
	return err
}

// Close initiates a graceful shutdown of the server by calling
// http.Server.Shutdown with a background context.
func (s *Serving) Close() error {
	return s.server.Shutdown(context.TODO())
}
