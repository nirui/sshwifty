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

package command

import (
	"errors"
	"fmt"

	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
)

// MaxCommandID is the highest valid command ID value that can be carried in a
// stream header. Command IDs must fit in four bits (0x00–0x0f).
const (
	MaxCommandID = 0x0f
)

// ErrCommandRunUndefinedCommand is returned by Commands.Run when the requested
// command ID has not been registered or exceeds MaxCommandID.
var (
	ErrCommandRunUndefinedCommand = errors.New(
		"undefined Command")
)

// Command is a factory function that constructs the FSMMachine for a single
// command execution. It receives a logger, the active hook set, the stream
// responder for sending data back to the client, the network configuration, and
// a shared buffer pool. It must return a non-nil FSMMachine.
type Command func(
	l log.Logger,
	h Hooks,
	w StreamResponder,
	cfg Configuration,
	bufferPool *BufferPool,
) FSMMachine

// Builder groups the registration metadata for a single command: its display
// name, the factory function used to instantiate it, and the reloader used
// to validate and normalise its configuration presets.
type Builder struct {
	name         string
	command      Command
	configurator configuration.PresetReloader
}

// Register constructs a Builder for registration into a Commands array.
// name is a human-readable label used for preset matching; c is the command
// factory; p is the preset reloader called during configuration.
func Register(name string, c Command, p configuration.PresetReloader) Builder {
	return Builder{
		name:         name,
		command:      c,
		configurator: p,
	}
}

// Commands is a fixed-size array that maps each command ID (0–MaxCommandID) to
// its corresponding Builder. The zero value of an unused slot has a nil command
// field, which causes Commands.Run to return ErrCommandRunUndefinedCommand.
type Commands [MaxCommandID + 1]Builder

// Register associates a command factory with the given numeric id. It panics if
// id exceeds MaxCommandID or if the slot is already occupied.
func (c *Commands) Register(
	id byte,
	name string,
	cb Command,
	ps configuration.PresetReloader,
) {
	if id > MaxCommandID {
		panic("Command ID must be not greater than MaxCommandID")
	}

	if (*c)[id].command != nil {
		panic(fmt.Sprintf("Command %d already been registered", id))
	}

	(*c)[id] = Register(name, cb, ps)
}

// Run instantiates and returns an FSM for the command identified by id. It
// returns ErrCommandRunUndefinedCommand if id is out of range or the slot is
// unregistered. On success, the returned FSM is ready to be booted up.
func (c Commands) Run(
	id byte,
	l log.Logger,
	hooks Hooks,
	w StreamResponder,
	cfg Configuration,
	bufferPool *BufferPool,
) (FSM, error) {
	if id > MaxCommandID {
		return FSM{}, ErrCommandRunUndefinedCommand
	}

	cc := c[id]

	if cc.command == nil {
		return FSM{}, ErrCommandRunUndefinedCommand
	}

	return newFSM(cc.command(l, hooks, w, cfg, bufferPool)), nil
}

// Reconfigure passes each preset in p through the configurator of whichever
// registered command claims it by name. Presets with no matching command are
// silently dropped. It returns the filtered and normalised preset list, or the
// first error returned by a command's configurator.
func (c Commands) Reconfigure(
	p []configuration.Preset,
) ([]configuration.Preset, error) {
	newP := make([]configuration.Preset, 0, len(p))

	for i := range c {
		for pp := range p {
			if c[i].name != p[pp].Type {
				continue
			}

			newPP, pErr := c[i].configurator(p[pp])

			if pErr == nil {
				newP = append(newP, newPP)

				continue
			}

			return nil, pErr
		}
	}

	return newP, nil
}
