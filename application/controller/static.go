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

//go:generate go run ./static_page_generater ../../.tmp/dist ./static_pages.go
//go:generate go fmt ./static_pages.go

package controller

import (
	"net/http"
	"strings"
	"time"

	"github.com/Snuffy2/sshwifty/application/log"
)

// staticData holds an embedded static file together with its optional
// gzip-compressed variant, content type, creation timestamp, and ETag hash.
// Files that do not benefit from compression (images, fonts) will have an
// empty compressed slice.
type staticData struct {
	// data is the raw (uncompressed) content of the file.
	data []byte
	// dataHash is an ETag-compatible hash of data, reserved for future cache
	// validation use.
	dataHash string
	// compressed is the gzip-compressed form of data. It is empty when
	// compression was skipped for this file type.
	compressed []byte
	// created records when the static file was compiled into the binary.
	created time.Time
	// contentType is the MIME type used in the Content-Type response header.
	contentType string
}

// hasCompressed reports whether a pre-compressed variant of this file is
// available.
func (s staticData) hasCompressed() bool {
	return len(s.compressed) > 0
}

// staticFileExt returns the lowercased file extension of fileName, including
// the leading dot (e.g. ".js"). It returns an empty string if fileName
// contains no dot.
func staticFileExt(fileName string) string {
	extIdx := strings.LastIndex(fileName, ".")
	if extIdx < 0 {
		return ""
	}
	return strings.ToLower(fileName[extIdx:])
}

// serveStaticCacheData serves an embedded static asset identified by dataName
// with long-lived caching headers, but rejects HTML/HTM files by returning
// ErrNotFound so they cannot be served directly as assets (they are served
// only by their dedicated routes). For all other file types it delegates to
// serveStaticCachePage.
func serveStaticCacheData(
	dataName string,
	fileExt string,
	w http.ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	if fileExt == ".html" || fileExt == ".htm" {
		return ErrNotFound
	}
	return serveStaticCachePage(dataName, w, r, l)
}

// serveStaticCachePage writes the embedded static file identified by dataName
// to w with a long-lived public cache header ("max-age=5184000"). If the
// client advertises gzip support and a compressed variant is available, it
// sends the compressed form along with the appropriate Vary and
// Content-Encoding headers. It returns ErrNotFound when dataName is not
// present in the static page map.
func serveStaticCachePage(
	dataName string,
	w http.ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	d, dFound := staticPages[dataName]
	if !dFound {
		return ErrNotFound
	}
	selectedData := d.data
	if clientSupportGZIP(r) && d.hasCompressed() {
		selectedData = d.compressed
		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Add("Content-Encoding", "gzip")
	}
	w.Header().Add("Cache-Control", "public, max-age=5184000")
	w.Header().Add("Content-Type", d.contentType)
	_, wErr := w.Write(selectedData)
	return wErr
}

// serveStaticPage writes the embedded static page identified by dataName to w
// using the provided HTTP status code. It negotiates gzip encoding the same
// way as serveStaticCachePage but does not set caching headers, making it
// appropriate for HTML pages that should not be cached at the proxy layer.
// It returns ErrNotFound when dataName is absent from the static page map.
func serveStaticPage(
	dataName string,
	code int,
	w http.ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	d, dFound := staticPages[dataName]
	if !dFound {
		return ErrNotFound
	}
	selectedData := d.data
	if clientSupportGZIP(r) && d.hasCompressed() {
		selectedData = d.compressed
		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Add("Content-Encoding", "gzip")
	}
	w.Header().Add("Content-Type", d.contentType)
	w.WriteHeader(code)
	_, wErr := w.Write(selectedData)
	return wErr
}
