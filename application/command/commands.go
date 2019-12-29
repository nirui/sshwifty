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

package command

import (
	"errors"
	"fmt"

	"github.com/niruix/sshwifty/application/log"
)

// Consts
const (
	MaxCommandID = 0x0f
)

// Errors
var (
	ErrCommandRunUndefinedCommand = errors.New(
		"Undefined Command")
)

// Command represents a command handler machine builder
type Command func(
	l log.Logger,
	w StreamResponder,
	cfg Configuration,
) FSMMachine

// Commands contains data of all commands
type Commands [MaxCommandID + 1]Command

// Register registers a new command
func (c *Commands) Register(id byte, cb Command) {
	if id > MaxCommandID {
		panic("Command ID must be not greater than MaxCommandID")
	}

	if (*c)[id] != nil {
		panic(fmt.Sprintf("Command %d already been registered", id))
	}

	(*c)[id] = cb
}

// Run creates command executer
func (c Commands) Run(
	id byte,
	l log.Logger,
	w StreamResponder,
	cfg Configuration) (FSM, error) {
	if id > MaxCommandID {
		return FSM{}, ErrCommandRunUndefinedCommand
	}

	cc := c[id]

	if cc == nil {
		return FSM{}, ErrCommandRunUndefinedCommand
	}

	return newFSM(cc(l, w, cfg)), nil
}
