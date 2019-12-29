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
	"io"
	"sync"
	"time"

	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/network"
	"github.com/niruix/sshwifty/application/rw"
)

// Configuration contains configuration data needed to run command
type Configuration struct {
	Dial        network.Dial
	DialTimeout time.Duration
}

// Commander command control
type Commander struct {
	commands Commands
}

// New creates a new Commander
func New(cs Commands) Commander {
	return Commander{
		commands: cs,
	}
}

// New Adds a new client
func (c Commander) New(
	cfg Configuration,
	receiver rw.FetchReader,
	sender io.Writer,
	senderLock *sync.Mutex,
	receiveDelay time.Duration,
	sendDelay time.Duration,
	l log.Logger,
) (Handler, error) {
	return newHandler(
		cfg,
		&c.commands,
		receiver,
		sender,
		senderLock,
		receiveDelay,
		sendDelay,
		l,
	), nil
}
