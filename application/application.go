// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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

package application

import (
	"fmt"
	"io"
	goLog "log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/niruix/sshwifty/application/command"
	"github.com/niruix/sshwifty/application/configuration"
	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/server"
)

// ProccessSignaller send signal to the running application
type ProccessSignaller chan os.Signal

// ProccessSignallerBuilder builds a ProccessSignaler
type ProccessSignallerBuilder func() chan os.Signal

// DefaultProccessSignallerBuilder the default ProccessSignallerBuilder
func DefaultProccessSignallerBuilder() chan os.Signal {
	return make(chan os.Signal, 1)
}

var (
	screenLineWipper = []byte("\r")
)

// Application contains data required for the application, and yes I don't like
// to write comments
type Application struct {
	screen io.Writer
	logger log.Logger
}

// New creates a new Application
func New(screen io.Writer, logger log.Logger) Application {
	return Application{
		screen: screen,
		logger: logger,
	}
}

// Run execute the application. It will return when the application is finished
// running
func (a Application) run(
	cLoader configuration.Loader,
	closeSigBuilder ProccessSignallerBuilder,
	commands command.Commands,
	handlerBuilder server.HandlerBuilderBuilder,
) (bool, error) {
	var err error

	loaderName, c, cErr := cLoader(a.logger.Context("Configuration"))

	if cErr != nil {
		a.logger.Error("\"%s\" loader cannot load configuration: %s",
			loaderName, cErr)

		return false, cErr
	}

	// Allowing command to alter presets
	c.Presets, err = commands.Reconfigure(c.Presets)

	if err != nil {
		a.logger.Error("Unable to reconfigure presets: %s", err)

		return false, err
	}

	// Verify all configuration
	err = c.Verify()

	if err != nil {
		a.logger.Error("Configuration was invalid: %s", err)

		return false, err
	}

	closeNotify := closeSigBuilder()
	signal.Notify(closeNotify, os.Kill, os.Interrupt, syscall.SIGHUP)
	defer signal.Stop(closeNotify)

	servers := make([]*server.Serving, 0, len(c.Servers))
	s := server.New(a.logger)

	defer func() {
		for i := len(servers); i > 0; i-- {
			servers[i-1].Close()
		}

		s.Wait()
	}()

	closeNotifyDisableLock := sync.Mutex{}

	for _, ss := range c.Servers {
		newServer := s.Serve(c.Common(), ss, func(e error) {
			closeNotifyDisableLock.Lock()
			defer closeNotifyDisableLock.Unlock()

			if closeNotify == nil {
				return
			}

			err = e

			close(closeNotify)
			closeNotify = nil
		}, handlerBuilder(commands))

		servers = append(servers, newServer)
	}

	switch <-closeNotify {
	case syscall.SIGHUP:
		return true, nil

	case syscall.SIGTERM:
		fallthrough
	case os.Kill:
		fallthrough
	case os.Interrupt:
		a.screen.Write(screenLineWipper)

		return false, nil

	default:
		closeNotifyDisableLock.Lock()
		defer closeNotifyDisableLock.Unlock()

		return false, err
	}
}

// Run execute the application. It will return when the application is finished
// running
func (a Application) Run(
	cLoader configuration.Loader,
	closeSigBuilder ProccessSignallerBuilder,
	commands command.Commands,
	handlerBuilder server.HandlerBuilderBuilder,
) error {
	fmt.Fprintf(a.screen, banner, FullName, version, Author, URL)

	goLog.SetOutput(a.logger)
	defer goLog.SetOutput(os.Stderr)

	a.logger.Info("Initializing")
	defer a.logger.Info("Closed")

	for {
		restart, runErr := a.run(
			cLoader, closeSigBuilder, commands, handlerBuilder)

		if runErr != nil {
			a.logger.Error("Unable to start due to error: %s", runErr)

			return runErr
		}

		if restart {
			a.logger.Info("Restarting")

			continue
		}

		return nil
	}
}
