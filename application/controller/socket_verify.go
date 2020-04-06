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
	"crypto/hmac"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/niruix/sshwifty/application/configuration"
	"github.com/niruix/sshwifty/application/log"
)

type socketVerification struct {
	socket

	heartbeat     string
	timeout       string
	configRspBody []byte
}

type socketRemotePreset struct {
	Title string            `json:"title"`
	Type  string            `json:"type"`
	Host  string            `json:"host"`
	Meta  map[string]string `json:"meta"`
}

func buildAccessConfigRespondBody(remotes []configuration.Preset) []byte {
	presets := make([]socketRemotePreset, len(remotes))

	for i := range presets {
		presets[i] = socketRemotePreset{
			Title: remotes[i].Title,
			Type:  remotes[i].Type,
			Host:  remotes[i].Host,
			Meta:  remotes[i].Meta,
		}
	}

	mData, mErr := json.Marshal(presets)

	if mErr != nil {
		panic(fmt.Errorf("Unable to marshal remote data: %s", mErr))
	}

	return mData
}

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
		configRspBody: buildAccessConfigRespondBody(commCfg.Presets),
	}
}

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

func (s socketVerification) Get(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	hd := w.Header()
	hd.Add("Cache-Control", "no-store")
	hd.Add("Pragma", "no-store")

	key := r.Header.Get("X-Key")

	if len(key) <= 0 {
		hd.Add("X-Key", s.randomKey)

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

	if !hmac.Equal(s.authKey, decodedKey) {
		return ErrSocketAuthFailed
	}

	hd.Add("X-Key", s.randomKey)
	s.setServerConfigRespond(&hd, w)

	return nil
}
