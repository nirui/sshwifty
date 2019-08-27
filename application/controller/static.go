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

package controller

import (
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/niruix/sshwifty/application/log"
)

type staticData struct {
	data          []byte
	dataHash      string
	compressd     []byte
	compressdHash string
	created       time.Time
}

func (s staticData) hasCompressed() bool {
	return len(s.compressd) > 0
}

func staticFileExt(fileName string) string {
	extIdx := strings.LastIndex(fileName, ".")

	if extIdx < 0 {
		return ""
	}

	return strings.ToLower(fileName[extIdx:])
}

func serveStaticData(
	dataName string,
	fileExt string,
	w http.ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	if fileExt == ".html" || fileExt == ".htm" {
		return ErrNotFound
	}

	return serveStaticPage(dataName, fileExt, w, r, l)
}

func serveStaticPage(
	dataName string,
	fileExt string,
	w http.ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	if strings.ToUpper(r.Method) != "GET" {
		return ErrControllerNotImplemented
	}

	d, dFound := staticPages[dataName]

	if !dFound {
		return ErrNotFound
	}

	selectedData := d.data
	selectedDataHash := d.dataHash
	compressEnabled := false

	if clientSupportGZIP(r) && d.hasCompressed() {
		selectedData = d.compressd
		selectedDataHash = d.compressdHash

		compressEnabled = true

		w.Header().Add("Vary", "Accept-Encoding")
	}

	canUseCache := true

	if !clientContentEtagIsValid(r, selectedDataHash) {
		canUseCache = false
	}

	if clientContentModifiedSince(r, d.created) {
		canUseCache = false
	}

	if canUseCache {
		w.WriteHeader(http.StatusNotModified)

		return nil
	}

	w.Header().Add("Cache-Control", "public, max-age=31536000")
	w.Header().Add("ETag", "\""+selectedDataHash+"\"")

	mimeType := mime.TypeByExtension(fileExt)

	if len(mimeType) > 0 {
		w.Header().Add("Content-Type", mimeType)
	} else {
		w.Header().Add("Content-Type", "application/binary")
	}

	if compressEnabled {
		w.Header().Add("Content-Encoding", "gzip")
	}

	_, wErr := w.Write([]byte(selectedData))

	return wErr
}
