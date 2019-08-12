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

package commands

import (
	"errors"
	"io"
	"sync"
	"time"

	"github.com/niruix/sshwifty/application/command"
	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/network"
	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrTelnetUnableToReceiveRemoteConn = errors.New(
		"Unable to acquire remote connection handle")
)

// Error codes
const (
	TelnetRequestErrorBadRemoteAddress = command.StreamError(0x01)
)

// Server signal codes
const (
	TelnetServerRemoteBand    = 0x00
	TelnetServerDialFailed    = 0x01
	TelnetServerDialConnected = 0x02
)

type telnetClient struct {
	l           log.Logger
	w           command.StreamResponder
	dial        network.Dial
	remoteChan  chan io.WriteCloser
	remoteConn  io.WriteCloser
	closeWait   sync.WaitGroup
	dialTimeout time.Duration
}

func newTelnet(
	l log.Logger,
	w command.StreamResponder,
	dial network.Dial,
) command.FSMMachine {
	return &telnetClient{
		l:           l,
		w:           w,
		dial:        dial,
		remoteChan:  make(chan io.WriteCloser, 1),
		remoteConn:  nil,
		closeWait:   sync.WaitGroup{},
		dialTimeout: 10 * time.Second,
	}
}

func (d *telnetClient) Bootup(
	r *rw.LimitedReader,
	b []byte) (command.FSMState, command.FSMError) {
	addr, addrErr := ParseAddress(r.Read, b)

	if addrErr != nil {
		return nil, command.ToFSMError(
			addrErr, TelnetRequestErrorBadRemoteAddress)
	}

	// TODO: Test whether or not the address is allowed

	d.closeWait.Add(1)
	go d.remote(addr.String())

	return d.client, command.NoFSMError()
}

func (d *telnetClient) remote(addr string) {
	defer func() {
		d.w.Signal(command.HeaderClose)

		close(d.remoteChan)
		d.closeWait.Done()
	}()

	buf := [4096]byte{}

	clientConn, clientConnErr := d.dial("tcp", addr, d.dialTimeout)

	if clientConnErr != nil {
		errLen := copy(
			buf[d.w.HeaderSize():], clientConnErr.Error()) + d.w.HeaderSize()
		d.w.SendManual(TelnetServerDialFailed, buf[:errLen])

		return
	}

	defer clientConn.Close()

	clientConnErr = d.w.SendManual(
		TelnetServerDialConnected,
		buf[:d.w.HeaderSize()],
	)

	if clientConnErr != nil {
		return
	}

	d.remoteChan <- clientConn

	for {
		rLen, rErr := clientConn.Read(buf[d.w.HeaderSize():])

		if rErr != nil {
			return
		}

		wErr := d.w.SendManual(
			TelnetServerRemoteBand, buf[:rLen+d.w.HeaderSize()])

		if wErr != nil {
			return
		}
	}
}

func (d *telnetClient) getRemote() (io.WriteCloser, error) {
	if d.remoteConn != nil {
		return d.remoteConn, nil
	}

	remoteConn, ok := <-d.remoteChan

	if !ok {
		return nil, ErrTelnetUnableToReceiveRemoteConn
	}

	d.remoteConn = remoteConn

	return d.remoteConn, nil
}

func (d *telnetClient) client(
	f *command.FSM,
	r *rw.LimitedReader,
	h command.StreamHeader,
	b []byte,
) error {
	remoteConn, remoteConnErr := d.getRemote()

	if remoteConnErr != nil {
		return remoteConnErr
	}

	// All Telnet requests are in-band, so we just directly send them all
	// to the server
	for !r.Completed() {
		rBuf, rErr := r.Buffered()

		if rErr != nil {
			return rErr
		}

		_, wErr := remoteConn.Write(rBuf)

		if wErr != nil {
			d.l.Debug("Failed to write data to remote: %s", wErr)
		}

		return nil
	}

	return nil
}

func (d *telnetClient) Close() error {
	remoteConn, remoteConnErr := d.getRemote()

	if remoteConnErr == nil {
		remoteConn.Close()
	}

	d.closeWait.Wait()

	return nil
}

func (d *telnetClient) Release() error {
	return nil
}
