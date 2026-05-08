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

// Package commands – ssh.go implements the SSH command, which opens an
// interactive PTY session to a remote SSH server on behalf of the browser
// client. It handles fingerprint verification, credential exchange, terminal
// resizing, and concurrent stdout/stderr forwarding over the stream protocol.
package commands

import (
	"context"
	"errors"
	"io"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/Snuffy2/sshwifty/application/command"
	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
	"github.com/Snuffy2/sshwifty/application/network"
	"github.com/Snuffy2/sshwifty/application/rw"
)

// Server-to-client stream marker constants.
// SSHServerRemoteStdOut carries PTY stdout data.
// SSHServerRemoteStdErr carries PTY stderr data.
// SSHServerHookOutputBeforeConnecting forwards hook stdout to the client.
// SSHServerConnectFailed signals that the SSH dial or session setup failed.
// SSHServerConnectSucceed signals that the session is ready.
// SSHServerConnectVerifyFingerprint sends the server fingerprint for approval.
// SSHServerConnectRequestCredential requests a passphrase or private key.
const (
	SSHServerRemoteStdOut               = 0x00
	SSHServerRemoteStdErr               = 0x01
	SSHServerHookOutputBeforeConnecting = 0x02
	SSHServerConnectFailed              = 0x03
	SSHServerConnectSucceed             = 0x04
	SSHServerConnectVerifyFingerprint   = 0x05
	SSHServerConnectRequestCredential   = 0x06
)

// Client-to-server stream marker constants.
// SSHClientStdIn carries keyboard input to the remote PTY.
// SSHClientResize sends new terminal dimensions (rows, cols as two big-endian
// uint16s).
// SSHClientRespondFingerprint carries the client's accept/reject decision.
// SSHClientRespondCredential carries the passphrase or private key bytes.
const (
	SSHClientStdIn              = 0x00
	SSHClientResize             = 0x01
	SSHClientRespondFingerprint = 0x02
	SSHClientRespondCredential  = 0x03
)

// sshCredentialMaxSize is the maximum number of credential bytes the server
// will accept from the client in a single SSHClientRespondCredential frame.
const (
	sshCredentialMaxSize = 4096
)

// SSH bootup stream error codes.
// SSHRequestErrorBadUserName indicates a malformed username field.
// SSHRequestErrorBadRemoteAddress indicates a malformed address field.
// SSHRequestErrorBadAuthMethod indicates an unrecognised auth method byte.
const (
	SSHRequestErrorBadUserName      = command.StreamError(0x01)
	SSHRequestErrorBadRemoteAddress = command.StreamError(0x02)
	SSHRequestErrorBadAuthMethod    = command.StreamError(0x03)
)

// SSH authentication method codes sent by the client during Bootup.
// SSHAuthMethodNone uses no authentication.
// SSHAuthMethodPassphrase uses password authentication.
// SSHAuthMethodPrivateKey uses public-key authentication.
const (
	SSHAuthMethodNone       byte = 0x00
	SSHAuthMethodPassphrase byte = 0x01
	SSHAuthMethodPrivateKey byte = 0x02
)

// sshAuthMethodBuilder is a factory called on the remote goroutine to produce
// the ssh.AuthMethod slice for a connection attempt. It receives a scratch
// buffer b for temporary credential storage.
type sshAuthMethodBuilder func(b []byte) []ssh.AuthMethod

// Errors
var (
	ErrSSHAuthCancelled = errors.New(
		"authentication has been cancelled")

	ErrSSHInvalidAuthMethod = errors.New(
		"invalid auth method")

	ErrSSHInvalidAddress = errors.New(
		"invalid address")

	ErrSSHRemoteFingerprintVerificationCancelled = errors.New(
		"server Fingerprint verification process has been cancelled")

	ErrSSHRemoteFingerprintRefused = errors.New(
		"server Fingerprint has been refused")

	ErrSSHRemoteConnUnavailable = errors.New(
		"remote SSH connection is unavailable")

	ErrSSHUnexpectedFingerprintVerificationRespond = errors.New(
		"unexpected fingerprint verification respond")

	ErrSSHUnexpectedCredentialDataRespond = errors.New(
		"unexpected credential data respond")

	ErrSSHCredentialDataTooLarge = errors.New(
		"credential was too large")

	ErrSSHUnknownClientSignal = errors.New(
		"unknown client signal")
)

// sshEmptyTime is the zero value used to clear read deadlines on an SSH
// connection once the initial handshake is complete.
var (
	sshEmptyTime = time.Time{}
)

// sshDefaultPortString is the default TCP port appended when the preset host
// does not include an explicit port.
const (
	sshDefaultPortString = "22"
)

// sshRemoteConnWrapper wraps a net.Conn to provide two behaviours required by
// the SSH library: write operations are routed through a WriteTimeoutConn to
// enforce deadlines, and read timeouts may be retried (extended) when an
// interactive credential exchange is in progress.
type sshRemoteConnWrapper struct {
	net.Conn

	// writerConn enforces write deadlines on the underlying connection.
	writerConn network.WriteTimeoutConn
	// requestTimeoutRetry is called when a read times out; if it returns true
	// the read deadline is extended and the read is retried.
	requestTimeoutRetry func(s *sshRemoteConnWrapper) bool
}

func (s *sshRemoteConnWrapper) Read(b []byte) (int, error) {
	for {
		rLen, rErr := s.Conn.Read(b)
		if rErr == nil {
			return rLen, nil
		}

		netErr, isNetErr := rErr.(net.Error)
		if !isNetErr || !netErr.Timeout() || !s.requestTimeoutRetry(s) {
			return rLen, rErr
		}
	}
}

func (s *sshRemoteConnWrapper) Write(b []byte) (int, error) {
	return s.writerConn.Write(b)
}

// sshRemoteConn bundles the three handles needed to interact with an active SSH
// session: a writer for stdin, a closer that tears down both session and
// connection, and the session handle for window-change requests.
type sshRemoteConn struct {
	// writer is the stdin pipe of the remote PTY session.
	writer io.Writer
	// closer shuts down the SSH session and underlying TCP connection.
	closer func() error
	// session is the active SSH session used for window-change requests.
	session *ssh.Session
}

// isValid returns true when all three fields of the sshRemoteConn are non-nil,
// indicating the connection was successfully established.
func (s sshRemoteConn) isValid() bool {
	return s.writer != nil && s.closer != nil && s.session != nil
}

// sshClient implements command.FSMMachine for an SSH session. The local method
// is the FSMState that handles client-originated frames; the remote method runs
// in a separate goroutine and drives the SSH dial, authentication, and data
// forwarding.
type sshClient struct {
	// w is the stream responder for sending data to the browser client.
	w command.StreamResponder
	// l is the logger for this session.
	l log.Logger
	// hooks holds the hook instances to run at connection events.
	hooks command.Hooks
	// cfg holds the network dial configuration.
	cfg command.Configuration
	// bufferPool is the shared buffer pool for this session.
	bufferPool *command.BufferPool
	// baseCtx is cancelled when the session should be torn down.
	baseCtx context.Context
	// baseCtxCancel cancels baseCtx; it is wrapped with sync.OnceFunc.
	baseCtxCancel func()
	// remoteCloseWait is decremented when the remote goroutine exits.
	remoteCloseWait sync.WaitGroup
	// remoteReadTimeoutRetry and remoteReadForceRetryNextTimeout control
	// whether read timeouts on the SSH connection are retried while waiting
	// for credential or fingerprint responses from the client.
	remoteReadTimeoutRetry          bool
	remoteReadForceRetryNextTimeout bool
	remoteReadTimeoutRetryLock      sync.Mutex
	// credentialReceive delivers passphrase or private key bytes from the
	// client to the remote goroutine's auth callback.
	credentialReceive       chan []byte
	credentialProcessed     bool
	credentialReceiveClosed bool
	// fingerprintVerifyResultReceive delivers the client's fingerprint
	// accept/reject decision to the remote goroutine.
	fingerprintVerifyResultReceive       chan bool
	fingerprintProcessed                 bool
	fingerprintVerifyResultReceiveClosed bool
	// remoteConnReceive delivers the established sshRemoteConn to the local
	// FSMState once the SSH session is ready.
	remoteConnReceive chan sshRemoteConn
	// remoteConn caches the received sshRemoteConn after first retrieval.
	remoteConn sshRemoteConn
}

// newSSH is the command.Command factory for the SSH command. It returns a fully
// initialised sshClient ready for Bootup.
func newSSH(
	l log.Logger,
	hooks command.Hooks,
	w command.StreamResponder,
	cfg command.Configuration,
	bufferPool *command.BufferPool,
) command.FSMMachine {
	ctx, ctxCancel := context.WithCancel(context.Background())
	return &sshClient{
		w:                                    w,
		l:                                    l,
		hooks:                                hooks,
		cfg:                                  cfg,
		bufferPool:                           bufferPool,
		baseCtx:                              ctx,
		baseCtxCancel:                        sync.OnceFunc(ctxCancel),
		remoteCloseWait:                      sync.WaitGroup{},
		remoteReadTimeoutRetry:               false,
		remoteReadForceRetryNextTimeout:      false,
		remoteReadTimeoutRetryLock:           sync.Mutex{},
		credentialReceive:                    make(chan []byte, 1),
		credentialProcessed:                  false,
		credentialReceiveClosed:              false,
		fingerprintVerifyResultReceive:       make(chan bool, 1),
		fingerprintProcessed:                 false,
		fingerprintVerifyResultReceiveClosed: false,
		remoteConnReceive:                    make(chan sshRemoteConn, 1),
		remoteConn:                           sshRemoteConn{},
	}
}

// parseSSHConfig is the configuration.PresetReloader for the SSH command. It
// normalises the preset host by appending the default SSH port when no explicit
// port is present.
func parseSSHConfig(p configuration.Preset) (configuration.Preset, error) {
	oldHost := p.Host

	_, _, sErr := net.SplitHostPort(p.Host)
	if sErr != nil {
		p.Host = net.JoinHostPort(p.Host, sshDefaultPortString)
	}

	if len(p.Host) <= 0 {
		p.Host = oldHost
	}

	return p, nil
}

// sshMaxUsernameLen and sshMaxHostnameLen are the maximum byte lengths accepted
// when parsing the username and hostname fields during Bootup.
const (
	sshMaxUsernameLen = 127
	sshMaxHostnameLen = 255
)

func (d *sshClient) Bootup(
	r *rw.LimitedReader,
	b []byte,
) (command.FSMState, command.FSMError) {
	sBuf := d.bufferPool.Get()
	defer d.bufferPool.Put(sBuf)

	// User name
	userName, userNameErr := ParseString(r.Read, (*sBuf)[:sshMaxUsernameLen])
	if userNameErr != nil {
		return nil, command.ToFSMError(
			userNameErr, SSHRequestErrorBadUserName)
	}

	userNameStr := string(userName.Data())

	// Address
	addr, addrErr := ParseAddress(r.Read, (*sBuf)[:sshMaxHostnameLen])
	if addrErr != nil {
		return nil, command.ToFSMError(
			addrErr, SSHRequestErrorBadRemoteAddress)
	}

	addrStr := addr.String()
	if len(addrStr) <= 0 {
		return nil, command.ToFSMError(
			ErrSSHInvalidAddress, SSHRequestErrorBadRemoteAddress)
	}

	// Auth method
	rData, rErr := rw.FetchOneByte(r.Fetch)
	if rErr != nil {
		return nil, command.ToFSMError(
			rErr, SSHRequestErrorBadAuthMethod)
	}

	authMethodBuilder, authMethodBuilderErr := d.buildAuthMethod(rData[0])
	if authMethodBuilderErr != nil {
		return nil, command.ToFSMError(
			authMethodBuilderErr, SSHRequestErrorBadAuthMethod)
	}

	d.remoteCloseWait.Add(1)
	go d.remote(userNameStr, addrStr, authMethodBuilder)

	return d.local, command.NoFSMError()
}

// buildAuthMethod returns the sshAuthMethodBuilder corresponding to the auth
// method byte sent by the client during Bootup. Each builder, when called,
// may block to exchange credentials with the client via the credential channel.
func (d *sshClient) buildAuthMethod(
	methodType byte) (sshAuthMethodBuilder, error) {
	switch methodType {
	case SSHAuthMethodNone:
		return func(b []byte) []ssh.AuthMethod {
			return nil
		}, nil

	case SSHAuthMethodPassphrase:
		return func(b []byte) []ssh.AuthMethod {
			return []ssh.AuthMethod{
				ssh.PasswordCallback(func() (string, error) {
					d.enableRemoteReadTimeoutRetry()
					defer d.disableRemoteReadTimeoutRetry()

					wErr := d.w.SendManual(
						SSHServerConnectRequestCredential,
						b[d.w.HeaderSize():],
					)
					if wErr != nil {
						return "", wErr
					}

					passphraseBytes, passphraseReceived := <-d.credentialReceive
					if !passphraseReceived {
						return "", ErrSSHAuthCancelled
					}

					return string(passphraseBytes), nil
				}),
			}
		}, nil

	case SSHAuthMethodPrivateKey:
		return func(b []byte) []ssh.AuthMethod {
			return []ssh.AuthMethod{
				ssh.PublicKeysCallback(func() ([]ssh.Signer, error) {
					d.enableRemoteReadTimeoutRetry()
					defer d.disableRemoteReadTimeoutRetry()

					wErr := d.w.SendManual(
						SSHServerConnectRequestCredential,
						b[d.w.HeaderSize():],
					)
					if wErr != nil {
						return nil, wErr
					}

					privateKeyBytes, privateKeyReceived := <-d.credentialReceive
					if !privateKeyReceived {
						return nil, ErrSSHAuthCancelled
					}

					signer, signerErr := ssh.ParsePrivateKey(privateKeyBytes)
					if signerErr != nil {
						return nil, signerErr
					}

					return []ssh.Signer{signer}, signerErr
				}),
			}
		}, nil
	}

	return nil, ErrSSHInvalidAuthMethod
}

// confirmRemoteFingerprint implements the ssh.HostKeyCallback contract. It
// sends the SHA-256 fingerprint to the client, blocks until the client responds,
// and returns an error if the fingerprint is refused or the exchange is
// cancelled.
func (d *sshClient) confirmRemoteFingerprint(
	hostname string,
	remote net.Addr,
	key ssh.PublicKey,
	buf []byte,
) error {
	d.enableRemoteReadTimeoutRetry()
	defer d.disableRemoteReadTimeoutRetry()

	fgp := ssh.FingerprintSHA256(key)
	fgpLen := copy(buf[d.w.HeaderSize():], fgp)

	wErr := d.w.SendManual(
		SSHServerConnectVerifyFingerprint,
		buf[:d.w.HeaderSize()+fgpLen],
	)
	if wErr != nil {
		return wErr
	}

	confirmed, confirmOK := <-d.fingerprintVerifyResultReceive
	if !confirmOK {
		return ErrSSHRemoteFingerprintVerificationCancelled
	}
	if !confirmed {
		return ErrSSHRemoteFingerprintRefused
	}

	return nil
}

// enableRemoteReadTimeoutRetry enables timeout-retry mode on the SSH connection,
// which causes read timeouts to extend the deadline rather than fail. This is
// activated while waiting for client responses during authentication or
// fingerprint verification.
func (d *sshClient) enableRemoteReadTimeoutRetry() {
	d.remoteReadTimeoutRetryLock.Lock()
	defer d.remoteReadTimeoutRetryLock.Unlock()

	d.remoteReadTimeoutRetry = true
}

// disableRemoteReadTimeoutRetry turns off timeout-retry mode and sets the
// force-retry flag so that the next timeout after disabling is still retried
// once, preventing a race where a timeout fires immediately after disable.
func (d *sshClient) disableRemoteReadTimeoutRetry() {
	d.remoteReadTimeoutRetryLock.Lock()
	defer d.remoteReadTimeoutRetryLock.Unlock()

	d.remoteReadTimeoutRetry = false
	d.remoteReadForceRetryNextTimeout = true
}

// dialRemote establishes the underlying TCP connection, wraps it with deadline
// management, performs the SSH handshake using config, and returns the
// resulting ssh.Client along with a function that clears the initial read
// deadline once the session is ready. The caller is responsible for closing the
// client.
func (d *sshClient) dialRemote(
	networkName,
	addr string,
	config *ssh.ClientConfig) (*ssh.Client, func(), error) {
	dialCtx, dialCtxCancel := context.WithTimeout(d.baseCtx, config.Timeout)
	defer dialCtxCancel()
	conn, err := d.cfg.Dial(dialCtx, networkName, addr)
	if err != nil {
		return nil, nil, err
	}

	sshConn := &sshRemoteConnWrapper{
		Conn:       conn,
		writerConn: network.NewWriteTimeoutConn(conn, d.cfg.DialTimeout),
		requestTimeoutRetry: func(s *sshRemoteConnWrapper) bool {
			d.remoteReadTimeoutRetryLock.Lock()
			defer d.remoteReadTimeoutRetryLock.Unlock()

			if !d.remoteReadTimeoutRetry {
				if !d.remoteReadForceRetryNextTimeout {
					return false
				}
				d.remoteReadForceRetryNextTimeout = false
			}

			s.SetReadDeadline(time.Now().Add(config.Timeout))

			return true
		},
	}

	// Set timeout for writer, otherwise the Timeout writer will never
	// be triggered
	sshConn.SetWriteDeadline(time.Now().Add(d.cfg.DialTimeout))
	sshConn.SetReadDeadline(time.Now().Add(config.Timeout))

	c, chans, reqs, err := ssh.NewClientConn(sshConn, addr, config)
	if err != nil {
		sshConn.Close()
		return nil, nil, err
	}

	return ssh.NewClient(c, chans, reqs), func() {
		d.remoteReadTimeoutRetryLock.Lock()
		defer d.remoteReadTimeoutRetryLock.Unlock()

		d.remoteReadTimeoutRetry = false
		d.remoteReadForceRetryNextTimeout = true

		sshConn.SetReadDeadline(sshEmptyTime)
	}, nil
}

// remote runs in a dedicated goroutine for the lifetime of the SSH session.
// It executes the before-connecting hooks, dials the remote host, sets up the
// PTY, and streams stdout/stderr back to the client. On exit it sends a
// HeaderClose signal, closes the remoteConnReceive channel, and cancels the
// base context.
func (d *sshClient) remote(
	user string, address string, authMethodBuilder sshAuthMethodBuilder) {
	u := d.bufferPool.Get()
	defer d.bufferPool.Put(u)

	defer func() {
		d.w.Signal(command.HeaderClose)
		close(d.remoteConnReceive)
		d.baseCtxCancel()
		d.remoteCloseWait.Done()
	}()

	err := d.hooks.Run(
		d.baseCtx,
		configuration.HOOK_BEFORE_CONNECTING,
		command.NewHookParameters(2).
			Insert("Remote Type", "SSH").
			Insert("Remote Address", address),
		command.NewDefaultHookOutput(d.l, func(
			b []byte,
		) (wLen int, wErr error) {
			wLen = len(b)
			dLen := copy((*u)[d.w.HeaderSize():], b) + d.w.HeaderSize()
			wErr = d.w.SendManual(
				SSHServerHookOutputBeforeConnecting,
				(*u)[:dLen],
			)
			return
		}),
	)
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		return
	}

	errOutWg := sync.WaitGroup{}
	defer errOutWg.Wait()

	conn, clearConnInitialDeadline, err :=
		d.dialRemote("tcp", address, &ssh.ClientConfig{
			User: user,
			Auth: authMethodBuilder((*u)[:]),
			HostKeyCallback: func(h string, r net.Addr, k ssh.PublicKey) error {
				return d.confirmRemoteFingerprint(h, r, k, (*u)[:])
			},
			Timeout: d.cfg.DialTimeout,
		})
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable to connect to remote machine: %s", err)
		return
	}
	defer conn.Close()

	session, err := conn.NewSession()
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable open new session on remote machine: %s", err)
		return
	}
	defer session.Close()

	in, err := session.StdinPipe()
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable export Stdin pipe: %s", err)
		return
	}

	out, err := session.StdoutPipe()
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) +
			d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable export Stdout pipe: %s", err)
		return
	}

	errOut, err := session.StderrPipe()
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) +
			d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable export Stderr pipe: %s", err)
		return
	}

	err = session.RequestPty("xterm", 80, 40, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	})
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable request PTY: %s", err)
		return
	}

	err = session.Shell()
	if err != nil {
		errLen := copy((*u)[d.w.HeaderSize():], err.Error()) + d.w.HeaderSize()
		d.w.SendManual(SSHServerConnectFailed, (*u)[:errLen])
		d.l.Debug("Unable to start Shell: %s", err)
		return
	}
	defer session.Wait()

	clearConnInitialDeadline()

	d.remoteConnReceive <- sshRemoteConn{
		writer: in,
		closer: func() error {
			session.Close()

			return conn.Close()
		},
		session: session,
	}

	wErr := d.w.SendManual(
		SSHServerConnectSucceed, (*u)[:d.w.HeaderSize()])
	if wErr != nil {
		return
	}

	d.l.Debug("Serving")

	errOutWg.Go(func() {
		u := d.bufferPool.Get()
		defer d.bufferPool.Put(u)

		for {
			rLen, err := errOut.Read((*u)[d.w.HeaderSize():])
			if err != nil {
				return
			}

			err = d.w.SendManual(
				SSHServerRemoteStdErr, (*u)[:d.w.HeaderSize()+rLen])
			if err != nil {
				return
			}
		}
	})

	for {
		rLen, rErr := out.Read((*u)[d.w.HeaderSize():])
		if rErr != nil {
			return
		}

		rErr = d.w.SendManual(
			SSHServerRemoteStdOut, (*u)[:d.w.HeaderSize()+rLen])
		if rErr != nil {
			return
		}
	}
}

// getRemote returns the established sshRemoteConn, blocking on the
// remoteConnReceive channel if the remote goroutine has not yet delivered it.
// Subsequent calls return the cached value. It returns ErrSSHRemoteConnUnavailable
// if the channel was closed before a connection was delivered.
func (d *sshClient) getRemote() (sshRemoteConn, error) {
	if d.remoteConn.isValid() {
		return d.remoteConn, nil
	}

	remoteConn, remoteConnFetched := <-d.remoteConnReceive
	if !remoteConnFetched {
		return sshRemoteConn{}, ErrSSHRemoteConnUnavailable
	}
	d.remoteConn = remoteConn

	return d.remoteConn, nil
}

// local is the FSMState for the SSH command's main event loop. It dispatches
// incoming stream frames to the appropriate handler based on the marker byte:
// stdin data, terminal resize, fingerprint response, or credential response.
func (d *sshClient) local(
	f *command.FSM,
	r *rw.LimitedReader,
	h command.StreamHeader,
	b []byte,
) error {
	switch h.Marker() {
	case SSHClientStdIn:
		remote, remoteErr := d.getRemote()
		if remoteErr != nil {
			return remoteErr
		}

		for !r.Completed() {
			rData, rErr := r.Buffered()
			if rErr != nil {
				return rErr
			}

			_, wErr := remote.writer.Write(rData)
			if wErr != nil {
				remote.closer()
				d.l.Debug("Failed to write data to remote: %s", wErr)
			}
		}

		return nil

	case SSHClientResize:
		remote, remoteErr := d.getRemote()
		if remoteErr != nil {
			return remoteErr
		}

		_, rErr := io.ReadFull(r, b[:4])
		if rErr != nil {
			return rErr
		}

		rows := int(b[0])
		rows <<= 8
		rows |= int(b[1])

		cols := int(b[2])
		cols <<= 8
		cols |= int(b[3])

		// It's ok for it to fail
		wcErr := remote.session.WindowChange(rows, cols)
		if wcErr != nil {
			d.l.Debug("Failed to resize to %d, %d: %s", rows, cols, wcErr)
		}

		return nil

	case SSHClientRespondFingerprint:
		if d.fingerprintProcessed {
			return ErrSSHUnexpectedFingerprintVerificationRespond
		}

		d.fingerprintProcessed = true

		rData, rErr := rw.FetchOneByte(r.Fetch)
		if rErr != nil {
			return rErr
		}

		comfirmed := rData[0] == 0

		if !comfirmed {
			d.fingerprintVerifyResultReceive <- false

			remote, remoteErr := d.getRemote()
			if remoteErr == nil {
				remote.closer()
			}
		} else {
			d.fingerprintVerifyResultReceive <- true
		}

		return nil

	case SSHClientRespondCredential:
		if d.credentialProcessed {
			return ErrSSHUnexpectedCredentialDataRespond
		}

		d.credentialProcessed = true

		sshCredentialBufSize := min(r.Remains(), sshCredentialMaxSize)
		credentialDataBuf := make([]byte, 0, sshCredentialBufSize)
		totalCredentialRead := 0

		for !r.Completed() {
			rData, rErr := r.Buffered()
			if rErr != nil {
				return rErr
			}

			totalCredentialRead += len(rData)
			if totalCredentialRead > sshCredentialBufSize {
				return ErrSSHCredentialDataTooLarge
			}

			credentialDataBuf = append(credentialDataBuf, rData...)
		}

		d.credentialReceive <- credentialDataBuf

		return nil

	default:
		return ErrSSHUnknownClientSignal
	}
}

func (d *sshClient) Close() error {
	d.credentialProcessed = true
	d.fingerprintProcessed = true

	if !d.credentialReceiveClosed {
		close(d.credentialReceive)

		d.credentialReceiveClosed = true
	}

	if !d.fingerprintVerifyResultReceiveClosed {
		close(d.fingerprintVerifyResultReceive)

		d.fingerprintVerifyResultReceiveClosed = true
	}

	remote, remoteErr := d.getRemote()
	if remoteErr == nil {
		remote.closer()
	}

	d.baseCtxCancel()
	d.remoteCloseWait.Wait()

	return nil
}

func (d *sshClient) Release() error {
	d.baseCtxCancel()
	return nil
}
