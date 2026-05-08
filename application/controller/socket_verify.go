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

package controller

import (
	"crypto/hmac"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"time"

	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
)

// socketVerification is the controller for the "/sshwifty/socket/verify"
// endpoint. It handles client authentication via a time-windowed HMAC token
// and returns server configuration (heartbeat interval, timeout, and preset
// remote list) as JSON to authenticated clients.
type socketVerification struct {
	socket

	// heartbeat is the server's configured heartbeat timeout in seconds,
	// pre-formatted as a string for inclusion in the X-Heartbeat response header.
	heartbeat string
	// timeout is the server's configured read timeout in seconds,
	// pre-formatted as a string for inclusion in the X-Timeout response header.
	timeout string
	// configRspBody is the pre-serialized JSON body containing the access
	// configuration (presets and server message) sent to authenticated clients.
	configRspBody []byte
}

// socketRemotePreset is the JSON-serializable representation of a single
// preset remote connection. It is derived from configuration.Preset and
// transmitted to the client as part of the socket access configuration.
type socketRemotePreset struct {
	Title    string            `json:"title"`
	Type     string            `json:"type"`
	Host     string            `json:"host"`
	TabColor string            `json:"tab_color"`
	Meta     map[string]string `json:"meta"`
}

// socketAccessConfiguration is the top-level JSON envelope sent to the client
// after successful authentication on the verification endpoint. It carries the
// list of preset remote connections and the HTML-escaped server message.
type socketAccessConfiguration struct {
	Presets       []socketRemotePreset `json:"presets"`
	ServerMessage string               `json:"server_message"`
}

// newSocketAccessConfiguration builds a socketAccessConfiguration from the
// given slice of configured presets and a server message. The server message
// is HTML-escaped and then Markdown-link-converted before being embedded in
// the response.
func newSocketAccessConfiguration(
	remotes []configuration.Preset,
	serverMessage string,
) socketAccessConfiguration {
	presets := make([]socketRemotePreset, len(remotes))
	for i := range presets {
		presets[i] = socketRemotePreset{
			Title:    remotes[i].Title,
			Type:     remotes[i].Type,
			Host:     remotes[i].Host,
			TabColor: remotes[i].TabColor,
			Meta:     remotes[i].Meta,
		}
	}
	return socketAccessConfiguration{
		Presets:       presets,
		ServerMessage: parseServerMessage(html.EscapeString(serverMessage)),
	}
}

// buildAccessConfigRespondBody serializes accessCfg to JSON. It panics if
// marshaling fails, which should never occur for this well-typed struct.
func buildAccessConfigRespondBody(accessCfg socketAccessConfiguration) []byte {
	mData, mErr := json.Marshal(accessCfg)
	if mErr != nil {
		panic(fmt.Errorf("unable to marshal remote data: %s", mErr))
	}
	return mData
}

// newSocketVerification constructs a socketVerification controller that wraps
// s and pre-computes the heartbeat interval, read timeout, and the JSON access
// configuration body from srvCfg and commCfg. The configuration body is built
// once at startup to avoid repeated serialization on every request.
func newSocketVerification(
	s socket,
	srvCfg configuration.Server,
	commCfg configuration.Common,
) socketVerification {
	return socketVerification{
		socket: s,
		heartbeat: strconv.FormatFloat(
			srvCfg.HeartbeatTimeout.Seconds(), 'g', 2, 64),
		timeout: strconv.FormatFloat(
			srvCfg.ReadTimeout.Seconds(), 'g', 2, 64),
		configRspBody: buildAccessConfigRespondBody(
			newSocketAccessConfiguration(
				commCfg.Presets,
				srvCfg.ServerMessage,
			),
		),
	}
}

// authKey derives the expected 32-byte authentication token for this request
// using a truncated Unix timestamp (100-second window) combined with the
// configured shared key. When no shared key is set a well-known default string
// is used, which effectively disables authentication.
func (s socketVerification) authKey(r *http.Request) []byte {
	timeMixer := strconv.FormatInt(time.Now().Unix()/100, 10)
	if len(s.commonCfg.SharedKey) > 0 {
		return hashCombineSocketKeys(
			timeMixer,
			s.commonCfg.SharedKey,
		)[:32]
	}
	return hashCombineSocketKeys(
		timeMixer,
		"DEFAULT VERIFY KEY",
	)[:32]
}

// setServerConfigRespond appends the X-Heartbeat, X-Timeout, and (when
// applicable) X-OnlyAllowPresetRemotes headers to hd, sets the Content-Type,
// and writes the pre-serialized JSON configuration body to w.
func (s socketVerification) setServerConfigRespond(
	hd *http.Header, w http.ResponseWriter) {
	hd.Add("X-Heartbeat", s.heartbeat)
	hd.Add("X-Timeout", s.timeout)
	if s.commonCfg.OnlyAllowPresetRemotes {
		hd.Add("X-OnlyAllowPresetRemotes", "yes")
	}
	hd.Add("Content-Type", "text/json; charset=utf-8")
	w.Write(s.configRspBody)
}

// Get handles HTTP GET requests for the socket verification endpoint. When no
// X-Key header is present and no shared key is configured, it returns the
// server configuration immediately. When a shared key is configured and no
// X-Key header is present, it returns ErrSocketInvalidAuthKey. When an X-Key
// header is present, it base64-decodes the value, applies a 500ms delay to
// slow brute-force attempts, and compares the decoded bytes against the
// time-windowed HMAC; it returns ErrSocketAuthFailed on mismatch or the server
// configuration on success.
func (s socketVerification) Get(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	hd := w.Header()
	hd.Add("Cache-Control", "no-store")
	hd.Add("Pragma", "no-store")
	key := r.Header.Get("X-Key")
	if len(key) <= 0 {
		hd.Add("X-Key", base64.StdEncoding.EncodeToString(s.mixerKey(r)))
		if len(s.commonCfg.SharedKey) <= 0 {
			s.setServerConfigRespond(&hd, w)
			return nil
		}
		return ErrSocketInvalidAuthKey
	}
	if len(key) > 64 {
		return ErrSocketInvalidAuthKey
	}
	// Delay the brute force attack. Use it with connection limits (via
	// iptables or nginx etc)
	time.Sleep(500 * time.Millisecond)
	decodedKey, decodedKeyErr := base64.StdEncoding.DecodeString(key)
	if decodedKeyErr != nil {
		return NewError(http.StatusBadRequest, decodedKeyErr.Error())
	}
	authKey := s.authKey(r)
	if !hmac.Equal(authKey, decodedKey) {
		return ErrSocketAuthFailed
	}
	hd.Add("X-Key", base64.StdEncoding.EncodeToString(s.mixerKey(r)))
	s.setServerConfigRespond(&hd, w)
	return nil
}
