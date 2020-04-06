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

package controller

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/niruix/sshwifty/application/command"
	"github.com/niruix/sshwifty/application/configuration"
	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrSocketInvalidAuthKey = NewError(
		http.StatusForbidden,
		"To use Websocket interface, a valid Auth Key must be provided")

	ErrSocketAuthFailed = NewError(
		http.StatusForbidden,
		"Authentication has failed with provided Auth Key")

	ErrSocketUnableToGenerateKey = NewError(
		http.StatusInternalServerError,
		"Unable to generate crypto key")

	ErrSocketInvalidDataPackage = NewError(
		http.StatusBadRequest, "Invalid data package")
)

const (
	socketGCMStandardNonceSize = 12
)

type socket struct {
	baseController

	commonCfg configuration.Common
	serverCfg configuration.Server
	randomKey string
	authKey   []byte
	upgrader  websocket.Upgrader
	commander command.Commander
}

func getNewSocketCtlRandomSharedKey() string {
	b := [32]byte{}

	io.ReadFull(rand.Reader, b[:])

	return base64.StdEncoding.EncodeToString(b[:])
}

func getSocketAuthKey(randomKey string, sharedKey string) []byte {
	var k []byte

	if len(sharedKey) > 0 {
		k = []byte(sharedKey)
	} else {
		k = []byte(randomKey)
	}

	h := hmac.New(sha512.New, k)

	h.Write([]byte(randomKey))

	return h.Sum(nil)
}

func newSocketCtl(
	commonCfg configuration.Common,
	cfg configuration.Server,
	cmds command.Commands,
) socket {
	randomKey := getNewSocketCtlRandomSharedKey()

	return socket{
		commonCfg: commonCfg,
		serverCfg: cfg,
		randomKey: randomKey,
		authKey:   getSocketAuthKey(randomKey, commonCfg.SharedKey)[:32],
		upgrader:  buildWebsocketUpgrader(cfg),
		commander: command.New(cmds),
	}
}

type websocketWriter struct {
	*websocket.Conn
}

func (w websocketWriter) Write(b []byte) (int, error) {
	wErr := w.WriteMessage(websocket.BinaryMessage, b)

	if wErr != nil {
		return 0, wErr
	}

	return len(b), nil
}

type socketPackageWriter struct {
	w        websocketWriter
	packager func(w websocketWriter, b []byte) error
}

func (s socketPackageWriter) Write(b []byte) (int, error) {
	packageWriteErr := s.packager(s.w, b)

	if packageWriteErr != nil {
		return 0, packageWriteErr
	}

	return len(b), nil
}

func buildWebsocketUpgrader(cfg configuration.Server) websocket.Upgrader {
	return websocket.Upgrader{
		HandshakeTimeout: cfg.InitialTimeout,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
		Error: func(
			w http.ResponseWriter,
			r *http.Request,
			status int,
			reason error,
		) {
		},
	}
}

func (s socket) Options(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	w.Header().Add("Access-Control-Allow-Origin", "*")
	w.Header().Add("Access-Control-Allow-Headers", "X-Key")

	return nil
}

func (s socket) buildWSFetcher(c *websocket.Conn) rw.FetchReaderFetcher {
	return func() ([]byte, error) {
		for {
			mt, message, err := c.ReadMessage()

			if err != nil {
				return nil, err
			}

			if mt != websocket.BinaryMessage {
				return nil, NewError(
					http.StatusBadRequest,
					fmt.Sprintf("Received unknown type of data: %d", message))
			}

			return message, nil
		}
	}
}

func (s socket) generateNonce(nonce []byte) error {
	_, rErr := io.ReadFull(rand.Reader, nonce[:socketGCMStandardNonceSize])

	return rErr
}

func (s socket) increaseNonce(nonce []byte) {
	for i := len(nonce); i > 0; i-- {
		nonce[i-1]++

		if nonce[i-1] <= 0 {
			continue
		}

		break
	}
}

func (s socket) createCipher(key []byte) (cipher.AEAD, cipher.AEAD, error) {
	readCipher, readCipherErr := aes.NewCipher(key)

	if readCipherErr != nil {
		return nil, nil, readCipherErr
	}

	writeCipher, writeCipherErr := aes.NewCipher(key)

	if writeCipherErr != nil {
		return nil, nil, writeCipherErr
	}

	gcmRead, gcmReadErr := cipher.NewGCMWithNonceSize(
		readCipher, socketGCMStandardNonceSize)

	if gcmReadErr != nil {
		return nil, nil, gcmReadErr
	}

	gcmWrite, gcmWriteErr := cipher.NewGCMWithNonceSize(
		writeCipher, socketGCMStandardNonceSize)

	if gcmWriteErr != nil {
		return nil, nil, gcmWriteErr
	}

	return gcmRead, gcmWrite, nil
}

func (s socket) privateKey() string {
	if len(s.commonCfg.SharedKey) > 0 {
		return s.commonCfg.SharedKey
	}

	return s.randomKey
}

func (s socket) buildCipherKey() [16]byte {
	key := [16]byte{}
	now := strconv.FormatInt(time.Now().Unix()/100, 10)

	copy(key[:], getSocketAuthKey(now, s.privateKey()))

	return key
}

func (s socket) Get(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	// Error will not be returned when Websocket already handled
	// (i.e. returned the error to client). We just log the error and that's it
	c, err := s.upgrader.Upgrade(w, r, nil)

	if err != nil {
		return NewError(http.StatusBadRequest, err.Error())
	}

	defer c.Close()

	wsReader := rw.NewFetchReader(s.buildWSFetcher(c))
	wsWriter := websocketWriter{Conn: c}

	// Initialize ciphers
	//
	// WARNING: The AES-GCM cipher is here for authenticating user login. Yeah
	//          it is overkill and probably not correct. But I eventually decide
	//          to keep it as long as it authenticates (Hopefully in a safe and
	//          secured way).
	//
	//          DO NOT rely on this if you want to secured communitcation, in
	//          that case, you need to use HTTPS.
	//
	readNonce := [socketGCMStandardNonceSize]byte{}
	_, nonceReadErr := io.ReadFull(&wsReader, readNonce[:])

	if nonceReadErr != nil {
		return NewError(http.StatusBadRequest, fmt.Sprintf(
			"Unable to read initial client nonce: %s", nonceReadErr.Error()))
	}

	writeNonce := [socketGCMStandardNonceSize]byte{}
	nonceReadErr = s.generateNonce(writeNonce[:])

	if nonceReadErr != nil {
		return NewError(http.StatusBadRequest, fmt.Sprintf(
			"Unable to generate initial server nonce: %s",
			nonceReadErr.Error()))
	}

	_, nonceSendErr := wsWriter.Write(writeNonce[:])

	if nonceSendErr != nil {
		return NewError(http.StatusBadRequest, fmt.Sprintf(
			"Unable to send server nonce to client: %s", nonceSendErr.Error()))
	}

	cipherKey := s.buildCipherKey()

	readCipher, writeCipher, cipherCreationErr := s.createCipher(cipherKey[:])

	if cipherCreationErr != nil {
		return NewError(http.StatusInternalServerError, fmt.Sprintf(
			"Unable to create cipher: %s", cipherCreationErr.Error()))
	}

	// Start service
	const cipherReadBufSize = 4096

	cipherReadBuf := [cipherReadBufSize]byte{}
	cipherWriteBuf := [cipherReadBufSize]byte{}
	maxWriteLen := int(cipherReadBufSize) - (writeCipher.Overhead() + 2)

	senderLock := sync.Mutex{}
	cmdExec, cmdExecErr := s.commander.New(
		command.Configuration{
			Dial:        s.commonCfg.Dialer,
			DialTimeout: s.commonCfg.DecideDialTimeout(s.serverCfg.ReadTimeout),
		},
		rw.NewFetchReader(func() ([]byte, error) {
			defer s.increaseNonce(readNonce[:])

			// Size is unencrypted
			_, rErr := io.ReadFull(&wsReader, cipherReadBuf[:2])

			if rErr != nil {
				return nil, rErr
			}

			// Read full size
			packageSize := uint16(cipherReadBuf[0])
			packageSize <<= 8
			packageSize |= uint16(cipherReadBuf[1])

			if packageSize <= 0 || packageSize > cipherReadBufSize {
				return nil, ErrSocketInvalidDataPackage
			}

			if int(packageSize) <= wsReader.Remain() {
				rData, rErr := wsReader.Export(int(packageSize))

				if rErr != nil {
					return nil, rErr
				}

				return readCipher.Open(
					cipherReadBuf[:0], readNonce[:], rData, nil)
			}

			_, rErr = io.ReadFull(&wsReader, cipherReadBuf[:packageSize])

			if rErr != nil {
				return nil, rErr
			}

			return readCipher.Open(
				cipherReadBuf[:0],
				readNonce[:],
				cipherReadBuf[:packageSize],
				nil)
		}),
		socketPackageWriter{
			w: wsWriter,
			packager: func(w websocketWriter, b []byte) error {
				start := 0
				bLen := len(b)
				readLen := bLen

				for start < bLen {
					if readLen > maxWriteLen {
						readLen = maxWriteLen
					}

					encrypted := writeCipher.Seal(
						cipherWriteBuf[2:2],
						writeNonce[:],
						b[start:start+readLen],
						nil)

					s.increaseNonce(writeNonce[:])

					encryptedSize := uint16(len(encrypted))

					if encryptedSize <= 0 {
						return ErrSocketInvalidDataPackage
					}

					cipherWriteBuf[0] = byte(encryptedSize >> 8)
					cipherWriteBuf[1] = byte(encryptedSize)

					_, wErr := w.Write(cipherWriteBuf[:encryptedSize+2])

					if wErr != nil {
						return wErr
					}

					start += readLen
					readLen = bLen - start
				}

				return nil
			},
		}, &senderLock, s.serverCfg.ReadDelay, s.serverCfg.WriteDelay, l)

	if cmdExecErr != nil {
		return NewError(http.StatusBadRequest, cmdExecErr.Error())
	}

	return cmdExec.Handle()
}
