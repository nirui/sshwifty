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

// Package application provides the top-level application lifecycle management
// for Sshwifty, including startup, signal handling, configuration loading, and
// graceful shutdown with optional restart on SIGHUP.
package application

import (
	"fmt"
	"io"
	goLog "log"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"

	"github.com/Snuffy2/sshwifty/application/command"
	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
	"github.com/Snuffy2/sshwifty/application/server"
)

// ProccessSignaller is a channel used to send OS signals to the running
// application, triggering shutdown or restart behavior.
type ProccessSignaller chan os.Signal

// ProcessSignallerBuilder is a factory function that returns a new OS signal
// channel. Callers may substitute a custom builder for testing purposes.
type ProcessSignallerBuilder func() chan os.Signal

// DefaultProccessSignallerBuilder returns the default ProcessSignallerBuilder,
// which creates a buffered channel of size 1 for receiving OS signals.
func DefaultProccessSignallerBuilder() chan os.Signal {
	return make(chan os.Signal, 1)
}

var (
	// screenLineWipper is written to the screen output to clear the current
	// line before printing shutdown messages (e.g., to erase the ^C glyph).
	screenLineWipper = []byte("\r")
)

// Application holds the dependencies required to run the Sshwifty application,
// including the output writer for banner/status messages and the structured
// logger used throughout the lifetime of the process.
type Application struct {
	// screen is the writer used for banner output and user-facing status lines.
	screen io.Writer
	// logger is the structured logger routed to the output writer.
	logger log.Logger
}

// New creates a new Application with the given screen writer and logger.
func New(screen io.Writer, logger log.Logger) Application {
	return Application{
		screen: screen,
		logger: logger,
	}
}

// run performs a single execution cycle: loads configuration, starts all
// configured servers, and blocks until an OS signal arrives. It returns
// (true, nil) when a SIGHUP is received, indicating that the caller should
// restart; (false, nil) for clean shutdown signals; and (false, err) when an
// error forces an early exit.
func (a Application) run(
	cLoader configuration.Loader,
	closeSigBuilder ProcessSignallerBuilder,
	commands command.Commands,
	handlerBuilder server.HandlerBuilderBuilder,
) (bool, error) {
	var err error

	loaderName, c, cErr := cLoader(a.logger.TitledContext("Configuration"))

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
	closeNotifyDisableLock := sync.Mutex{}
	signal.Notify(closeNotify, os.Kill, os.Interrupt, syscall.SIGHUP)
	defer func() {
		closeNotifyDisableLock.Lock()
		defer closeNotifyDisableLock.Unlock()
		if closeNotify == nil {
			return
		}
		signal.Stop(closeNotify)
		close(closeNotify)
		closeNotify = nil
	}()

	servers := make([]*server.Serving, 0, len(c.Servers))
	s := server.New(a.logger)

	defer func() {
		for i := len(servers); i > 0; i-- {
			servers[i-1].Close()
		}
		s.Wait()
	}()

	for _, ss := range c.Servers {
		newServer := s.Serve(c.Common(), ss, func(e error) {
			closeNotifyDisableLock.Lock()
			defer closeNotifyDisableLock.Unlock()
			if closeNotify == nil {
				return
			}
			err = e
			signal.Stop(closeNotify)
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

// Run executes the application loop. It prints the startup banner, redirects
// the standard library logger to the application logger, then repeatedly calls
// run until a non-restart signal is received or a fatal error occurs. It
// returns the first non-nil error encountered, or nil on clean exit.
func (a Application) Run(
	cLoader configuration.Loader,
	closeSigBuilder ProcessSignallerBuilder,
	commands command.Commands,
	handlerBuilder server.HandlerBuilderBuilder,
) error {
	fmt.Fprintf(a.screen, banner, FullName, version, Author, URL)
	goLog.SetOutput(a.logger)
	defer goLog.SetOutput(os.Stderr)
	a.logger.Info("Initializing")
	defer a.logger.Info("Closed")
	a.logger.Debug(
		"Runtime: %s. GOOS=%s, GOARCH=%s",
		runtime.Version(),
		runtime.GOOS,
		runtime.GOARCH,
	)
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
