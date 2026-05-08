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

package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/Snuffy2/sshwifty/application/command"
	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
	"github.com/Snuffy2/sshwifty/application/server"
)

// ErrNotFound is returned when a requested URL path does not match any known
// route in the handler.
var (
	ErrNotFound = NewError(
		http.StatusNotFound, "Page not found")
)

const (
	// assetsURLPrefix is the URL path prefix under which all bundled static
	// assets are served (e.g. JavaScript, CSS, fonts, images).
	assetsURLPrefix = "/sshwifty/assets/"

	// assetsURLPrefixLen is the precomputed byte length of assetsURLPrefix,
	// used to efficiently strip the prefix when looking up asset names.
	assetsURLPrefixLen = len(assetsURLPrefix)
)

// handler is the main HTTP service dispatcher. It validates the Host header
// against the configured hostname (when set), routes incoming requests to the
// appropriate sub-controller, and converts controller errors into HTTP failure
// responses. It also adds a Date header to every response and logs request
// duration and outcome.
type handler struct {
	// hostNameChecker holds the configured hostname with a trailing colon,
	// used to tolerate "host:port" values in the Host header.
	hostNameChecker string
	commonCfg       configuration.Common
	logger          log.Logger
	homeCtl         home
	socketCtl       socket
	socketVerifyCtl socketVerification
}

// ServeHTTP implements http.Handler. It enforces hostname restrictions,
// dispatches the request to the matching controller, and writes error responses
// for any returned errors. Request duration is logged regardless of outcome.
func (h handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientLogger := h.logger.TitledContext("Client (%s)", r.RemoteAddr)
	if len(h.commonCfg.HostName) > 0 {
		hostPort := r.Host
		if len(hostPort) <= 0 {
			hostPort = r.URL.Host
		}
		if h.commonCfg.HostName != hostPort &&
			!strings.HasPrefix(hostPort, h.hostNameChecker) {
			clientLogger.Warning("Requested invalid host \"%s\", denied access",
				r.Host)
			serveFailure(
				NewError(http.StatusForbidden, "Invalid host"),
				w,
				r,
				h.logger,
			)
			return
		}
	}
	startTime := time.Now()
	ctlResponder := newResponseWriter(w)
	var err error
	defer func() {
		if err == nil {
			clientLogger.Info(
				"Request completed: %q (%s)",
				r.URL.String(),
				time.Since(startTime),
			)
			return
		}
		clientLogger.Warning("Request ended with error: %q: %s (%s)",
			r.URL.String(), err, time.Since(startTime))
		if controllerErr, isControllerErr := err.(Error); isControllerErr {
			serveFailure(controllerErr, &ctlResponder, r, h.logger)
			return
		}
		serveFailure(
			NewError(http.StatusInternalServerError, err.Error()),
			&ctlResponder,
			r,
			h.logger,
		)
	}()
	ctlResponder.Header().Add("Date", time.Now().UTC().Format(time.RFC1123))
	switch r.URL.Path {
	case "/":
		err = serveController(h.homeCtl, &ctlResponder, r, clientLogger)
	case "/sshwifty/socket":
		err = serveController(h.socketCtl, &ctlResponder, r, clientLogger)
	case "/sshwifty/socket/verify":
		err = serveController(h.socketVerifyCtl, &ctlResponder, r, clientLogger)
	case "/robots.txt":
		err = serveStaticCacheData(
			"robots.txt",
			staticFileExt(".txt"),
			&ctlResponder,
			r,
			clientLogger)
	case "/favicon.ico":
		err = serveStaticCacheData(
			"favicon.ico",
			staticFileExt(".ico"),
			&ctlResponder,
			r,
			clientLogger)
	case "/manifest.json":
		err = serveStaticCacheData(
			"manifest.json",
			staticFileExt(".json"),
			&ctlResponder,
			r,
			clientLogger)
	case "/browserconfig.xml":
		err = serveStaticCacheData(
			"browserconfig.xml",
			staticFileExt(".xml"),
			&ctlResponder,
			r,
			clientLogger)
	default:
		if strings.HasPrefix(r.URL.Path, assetsURLPrefix) &&
			strings.ToUpper(r.Method) == "GET" {
			err = serveStaticCacheData(
				r.URL.Path[assetsURLPrefixLen:],
				staticFileExt(r.URL.Path[assetsURLPrefixLen:]),
				&ctlResponder,
				r,
				clientLogger)
		} else {
			err = ErrNotFound
		}
	}
}

const (
	// socketBufferSize is the byte size of each buffer allocated from the pool
	// used for encrypting and decrypting WebSocket data frames.
	socketBufferSize = 4096
)

// Builder returns an http.Handler factory (server.HandlerBuilder) that wires
// together the application's controllers for a specific server configuration.
// It pre-allocates the shared WebSocket buffer pool and instantiates the
// socket and socket-verification controllers using the provided command set.
func Builder(cmds command.Commands) server.HandlerBuilder {
	socketBuffers := command.NewBufferPool(socketBufferSize)
	return func(
		commonCfg configuration.Common,
		cfg configuration.Server,
		logger log.Logger,
	) http.Handler {
		hooks := command.NewHooks(commonCfg.Hooks)
		socketCtl := newSocketCtl(commonCfg, cfg, cmds, hooks, &socketBuffers)
		return handler{
			hostNameChecker: commonCfg.HostName + ":",
			commonCfg:       commonCfg,
			logger:          logger,
			homeCtl:         home{},
			socketCtl:       socketCtl,
			socketVerifyCtl: newSocketVerification(socketCtl, cfg, commonCfg),
		}
	}
}
