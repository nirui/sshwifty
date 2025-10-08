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

package controller

import (
	"bufio"
	"errors"
	"net"
	"net/http"
)

type ResponseWriter struct {
	w        http.ResponseWriter
	disabled bool
}

func newResponseWriter(w http.ResponseWriter) ResponseWriter {
	return ResponseWriter{
		w:        w,
		disabled: false,
	}
}

func (r *ResponseWriter) Header() http.Header {
	return r.w.Header()
}

var (
	errResponseWriterDisabled = errors.New(
		"unable to write response to a disabled ResponseWriter")
)

func (r *ResponseWriter) Write(b []byte) (int, error) {
	if r.disabled {
		return 0, errResponseWriterDisabled
	}
	return r.w.Write(b)
}

func (r *ResponseWriter) WriteHeader(statusCode int) {
	if r.disabled {
		return
	}
	r.w.WriteHeader(statusCode)
}

var (
	errResponseWriterCannotBeHijacked = errors.New(
		"unable to hijack a disabled ResponseWriter")
)

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

func (r *ResponseWriter) disable() {
	r.disabled = true
}
