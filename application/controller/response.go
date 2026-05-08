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
	"bufio"
	"errors"
	"net"
	"net/http"
)

// ResponseWriter wraps an http.ResponseWriter and adds a disabled state that
// prevents further writes after a WebSocket upgrade has taken ownership of the
// underlying connection. This avoids double-write races when a controller
// hands off the connection to the WebSocket layer.
type ResponseWriter struct {
	// w is the underlying HTTP response writer.
	w http.ResponseWriter
	// disabled indicates that the connection has been hijacked and no further
	// HTTP-level writes should be attempted.
	disabled bool
}

// newResponseWriter creates a ResponseWriter wrapping w, initially in the
// enabled (non-disabled) state.
func newResponseWriter(w http.ResponseWriter) ResponseWriter {
	return ResponseWriter{
		w:        w,
		disabled: false,
	}
}

// Header returns the HTTP header map from the underlying response writer.
func (r *ResponseWriter) Header() http.Header {
	return r.w.Header()
}

// errResponseWriterDisabled is returned by Write and Hijack when the
// ResponseWriter has been disabled.
var (
	errResponseWriterDisabled = errors.New(
		"unable to write response to a disabled ResponseWriter")
)

// Write writes b to the underlying response writer. It returns
// errResponseWriterDisabled and writes nothing if the writer has been
// disabled.
func (r *ResponseWriter) Write(b []byte) (int, error) {
	if r.disabled {
		return 0, errResponseWriterDisabled
	}
	return r.w.Write(b)
}

// WriteHeader sends an HTTP response header with the given status code. It is
// a no-op if the writer has been disabled.
func (r *ResponseWriter) WriteHeader(statusCode int) {
	if r.disabled {
		return
	}
	r.w.WriteHeader(statusCode)
}

// errResponseWriterCannotBeHijacked is returned by Hijack when the underlying
// http.ResponseWriter does not implement http.Hijacker.
var (
	errResponseWriterCannotBeHijacked = errors.New(
		"unable to hijack a disabled ResponseWriter")
)

// Hijack takes over the TCP connection from the HTTP server by delegating to
// the underlying http.Hijacker. It returns errResponseWriterDisabled if the
// writer is already disabled, or errResponseWriterCannotBeHijacked if the
// underlying writer does not support hijacking.
func (r *ResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if r.disabled {
		return nil, nil, errResponseWriterDisabled
	}
	h, ok := r.w.(http.Hijacker)
	if !ok {
		return nil, nil, errResponseWriterCannotBeHijacked
	}
	return h.Hijack()
}

// disable marks the ResponseWriter as disabled, causing all subsequent Write,
// WriteHeader, and Hijack calls to return immediately without action or with
// an error.
func (r *ResponseWriter) disable() {
	r.disabled = true
}
