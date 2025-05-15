// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2023 Ni Rui <ranqus@gmail.com>
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
	"context"
	"errors"
	"net"
	"sync"
	"time"

	"github.com/nirui/sshwifty/application/command"
	"github.com/nirui/sshwifty/application/configuration"
	"github.com/nirui/sshwifty/application/log"
	"github.com/nirui/sshwifty/application/network"
	"github.com/nirui/sshwifty/application/rw"
)

// Errors
var (
	ErrTelnetUnableToReceiveRemoteConn = errors.New(
		"unable to acquire remote connection handle")
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
	TelnetServerRemoteBand                 = 0x00
	TelnetServerHookOutputBeforeConnecting = 0x01
	TelnetServerDialFailed                 = 0x02
	TelnetServerDialConnected              = 0x03
)

type telnetClient struct {
	l          log.Logger
	hooks      command.Hooks
	w          command.StreamResponder
	cfg        command.Configuration
	remoteChan chan net.Conn
	remoteConn net.Conn
	closeWait  sync.WaitGroup
}

func newTelnet(
	l log.Logger,
	hooks command.Hooks,
	w command.StreamResponder,
	cfg command.Configuration,
) command.FSMMachine {
	return &telnetClient{
		l:          l,
		hooks:      hooks,
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

	err := d.hooks.Run(
		context.Background(),
		configuration.HOOK_BEFORE_CONNECTING,
		command.NewHookParameters(2).
			Insert("Remote Type", "Telnet").
			Insert("Remote Address", addr),
		command.NewDefaultHookOutput(d.l, func(
			b []byte,
		) (wLen int, wErr error) {
			wLen = len(b)
			dLen := copy(buf[d.w.HeaderSize():], b) + d.w.HeaderSize()
			wErr = d.w.SendManual(
				TelnetServerHookOutputBeforeConnecting,
				buf[:dLen],
			)
			return
		}),
	)
	if err != nil {
		errLen := copy(buf[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(TelnetServerDialFailed, buf[:errLen])
		return
	}

	clientConn, err := d.cfg.Dial("tcp", addr, d.cfg.DialTimeout)
	if err != nil {
		errLen := copy(buf[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(TelnetServerDialFailed, buf[:errLen])
		return
	}
	defer clientConn.Close()

	err = d.w.SendManual(TelnetServerDialConnected, buf[:d.w.HeaderSize()])
	if err != nil {
		return
	}

	// Set timeout for writer, otherwise the Timeout writer will never
	// be triggered
	clientConn.SetWriteDeadline(time.Now().Add(d.cfg.DialTimeout))
	timeoutClientConn := network.NewWriteTimeoutConn(
		clientConn, d.cfg.DialTimeout)

	d.remoteChan <- &timeoutClientConn

	for {
		rLen, err := clientConn.Read(buf[d.w.HeaderSize():])
		if err != nil {
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
