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
	"net/http"
	"strings"
	"time"
)

func clientSupportGZIP(r *http.Request) bool {
	// Should be good enough
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

func clientContentEtagIsValid(r *http.Request, eTag string) bool {
	d := r.Header.Get("If-None-Match")

	if len(d) < 0 {
		return false
	}

	dStart := 0
	qETag := "\"" + eTag + "\""

	for {
		dIdx := strings.Index(d[dStart:], ",")

		if dIdx < 0 {
			return strings.Contains(d[dStart:], qETag) ||
				strings.Contains(d[dStart:], "*")
		}

		if strings.Contains(d[dStart:dStart+dIdx], qETag) {
			return true
		}

		if strings.Contains(d[dStart:dStart+dIdx], "*") {
			return true
		}

		dStart += dIdx + 1
	}
}

func clientContentModifiedSince(r *http.Request, mod time.Time) bool {
	d := r.Header.Get("If-Modified-Since")

	if len(d) < 0 {
		return false
	}

	dt, dtErr := time.Parse(time.RFC1123, d)

	if dtErr != nil {
		return false
	}

	return !mod.Before(dt)
}
