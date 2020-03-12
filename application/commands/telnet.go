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

package commands

import (
	"errors"
	"net"
	"sync"
	"time"

	"github.com/niruix/sshwifty/application/command"
	"github.com/niruix/sshwifty/application/configuration"
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

const (
	telnetDefaultPortString = "23"
)

// Server signal codes
const (
	TelnetServerRemoteBand    = 0x00
	TelnetServerDialFailed    = 0x01
	TelnetServerDialConnected = 0x02
)

type telnetClient struct {
	l          log.Logger
	w          command.StreamResponder
	cfg        command.Configuration
	remoteChan chan net.Conn
	remoteConn net.Conn
	closeWait  sync.WaitGroup
}

func newTelnet(
	l log.Logger,
	w command.StreamResponder,
	cfg command.Configuration,
) command.FSMMachine {
	return &telnetClient{
		l:          l,
		w:          w,
		cfg:        cfg,
		remoteChan: make(chan net.Conn, 1),
		remoteConn: nil,
		closeWait:  sync.WaitGroup{},
	}
}

func parseTelnetConfig(p configuration.Preset) (configuration.Preset, error) {
	oldHost := p.Host

	_, _, sErr := net.SplitHostPort(p.Host)

	if sErr != nil {
		p.Host = net.JoinHostPort(p.Host, telnetDefaultPortString)
	}

	if len(p.Host) <= 0 {
		p.Host = oldHost
	}

	return p, nil
}

func (d *telnetClient) Bootup(
	r *rw.LimitedReader,
	b []byte) (command.FSMState, command.FSMError) {
	addr, addrErr := ParseAddress(r.Read, b)

	if addrErr != nil {
		return nil, command.ToFSMError(
			addrErr, TelnetRequestErrorBadRemoteAddress)
	}

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

	clientConn, clientConnErr := d.cfg.Dial("tcp", addr, d.cfg.DialTimeout)

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

	// Set timeout for writer, otherwise the Timeout writer will never
	// be triggered
	clientConn.SetWriteDeadline(time.Now().Add(d.cfg.DialTimeout))
	timeoutClientConn := network.NewWriteTimeoutConn(
		clientConn, d.cfg.DialTimeout)

	d.remoteChan <- &timeoutClientConn

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

func (d *telnetClient) getRemote() (net.Conn, error) {
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
			remoteConn.Close()

			d.l.Debug("Failed to write data to remote: %s", wErr)
		}
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
