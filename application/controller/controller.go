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

package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/niruix/sshwifty/application/command"
	"github.com/niruix/sshwifty/application/configuration"
	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/server"
)

// Errors
var (
	ErrNotFound = NewError(
		http.StatusNotFound, "Page not found")
)

// handler is the main service dispatcher
type handler struct {
	hostNameChecker string
	commonCfg       configuration.Common
	logger          log.Logger
	homeCtl         home
	socketCtl       socket
}

func (h handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var err error

	clientLogger := h.logger.Context("Client (%s)", r.RemoteAddr)

	if len(h.commonCfg.HostName) > 0 {
		hostPort := r.Host

		if len(hostPort) <= 0 {
			hostPort = r.URL.Host
		}

		if h.commonCfg.HostName != hostPort &&
			!strings.HasPrefix(hostPort, h.hostNameChecker) {
			clientLogger.Warning("Request invalid host \"%s\", deined",
				r.Host)

			serveFailure(
				NewError(http.StatusForbidden, "Invalid host"), w, r, h.logger)

			return
		}
	}

	w.Header().Add("Date", time.Now().UTC().Format(time.RFC1123))

	switch r.URL.Path {
	case "/":
		err = serveController(h.homeCtl, w, r, clientLogger)

	case "/socket":
		err = serveController(h.socketCtl, w, r, clientLogger)

	case "/robots.txt":
		fallthrough
	case "/favicon.ico":
		fallthrough
	case "/README.md":
		fallthrough
	case "/LICENSE.md":
		fallthrough
	case "/DEPENDENCES.md":
		err = serveStaticData(r.URL.Path[1:], w, r, clientLogger)

	default:
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			err = serveStaticData(r.URL.Path[8:], w, r, clientLogger)
		} else {
			err = ErrNotFound
		}
	}

	if err == nil {
		clientLogger.Info("Request completed: %s", r.URL.String())

		return
	}

	clientLogger.Warning("Request ended with error: %s: %s",
		r.URL.String(), err)

	controllerErr, isControllerErr := err.(Error)

	if isControllerErr {
		serveFailure(controllerErr, w, r, h.logger)

		return
	}

	serveFailure(
		NewError(http.StatusInternalServerError, err.Error()), w, r, h.logger)
}

// Builder returns a http controller builder
func Builder(cmds command.Commands) server.HandlerBuilder {
	return func(
		commonCfg configuration.Common,
		cfg configuration.Server,
		logger log.Logger,
	) http.Handler {
		return handler{
			hostNameChecker: commonCfg.HostName + ":",
			commonCfg:       commonCfg,
			logger:          logger,
			homeCtl:         home{},
			socketCtl:       newSocketCtl(commonCfg, cfg, cmds),
		}
	}
}
