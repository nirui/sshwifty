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

// Package controller implements the HTTP request handlers for the Sshwifty web
// application, including the home page, WebSocket tunnel endpoint, socket
// verification, and embedded static asset delivery. It defines the controller
// dispatch model and wires together per-request routing, authentication
// checks, and response serialization.
package controller

import (
	"net/http"
	"strings"

	"github.com/Snuffy2/sshwifty/application/log"
)

// ErrControllerNotImplemented is returned by the default baseController
// methods when a specific HTTP verb is not overridden by an embedding type.
var (
	ErrControllerNotImplemented = NewError(
		http.StatusNotImplemented, "Server does not know how to handle the "+
			"request")
)

// controller is the internal interface that every HTTP endpoint handler must
// satisfy. Each method corresponds to an HTTP verb and receives the shared
// ResponseWriter, the original request, and a request-scoped logger. Methods
// return a non-nil error to signal that the handler could not process the
// request; the caller maps the error to an appropriate HTTP status response.
type controller interface {
	Get(w *ResponseWriter, r *http.Request, l log.Logger) error
	Head(w *ResponseWriter, r *http.Request, l log.Logger) error
	Post(w *ResponseWriter, r *http.Request, l log.Logger) error
	Put(w *ResponseWriter, r *http.Request, l log.Logger) error
	Delete(w *ResponseWriter, r *http.Request, l log.Logger) error
	Connect(w *ResponseWriter, r *http.Request, l log.Logger) error
	Options(w *ResponseWriter, r *http.Request, l log.Logger) error
	Trace(w *ResponseWriter, r *http.Request, l log.Logger) error
	Patch(w *ResponseWriter, r *http.Request, l log.Logger) error
	Other(
		method string,
		w *ResponseWriter,
		r *http.Request,
		l log.Logger,
	) error
}

// baseController is an embeddable struct that provides default implementations
// for every method in the controller interface. Each default method returns
// ErrControllerNotImplemented, so embedding types only need to override the
// verbs they actually support.
type baseController struct{}

// Get handles HTTP GET requests. It returns ErrControllerNotImplemented by
// default; embedding types should override this method to provide a real
// implementation.
func (b baseController) Get(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Head handles HTTP HEAD requests. It returns ErrControllerNotImplemented by
// default.
func (b baseController) Head(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Post handles HTTP POST requests. It returns ErrControllerNotImplemented by
// default.
func (b baseController) Post(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Put handles HTTP PUT requests. It returns ErrControllerNotImplemented by
// default.
func (b baseController) Put(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Delete handles HTTP DELETE requests. It returns ErrControllerNotImplemented
// by default.
func (b baseController) Delete(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Connect handles HTTP CONNECT requests. It returns ErrControllerNotImplemented
// by default.
func (b baseController) Connect(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Options handles HTTP OPTIONS requests. It returns ErrControllerNotImplemented
// by default.
func (b baseController) Options(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Trace handles HTTP TRACE requests. It returns ErrControllerNotImplemented by
// default.
func (b baseController) Trace(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Patch handles HTTP PATCH requests. It returns ErrControllerNotImplemented by
// default.
func (b baseController) Patch(
	w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// Other handles any HTTP method not covered by the named verb methods. It
// receives the raw method string and returns ErrControllerNotImplemented by
// default.
func (b baseController) Other(
	method string, w *ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

// serveController dispatches the incoming HTTP request to the appropriate
// method on c based on the uppercased value of r.Method. It returns the error
// produced by the matched method, or the result of c.Other for unrecognized
// verbs.
func serveController(
	c controller,
	w *ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	switch strings.ToUpper(r.Method) {
	case "GET":
		return c.Get(w, r, l)
	case "HEAD":
		return c.Head(w, r, l)
	case "POST":
		return c.Post(w, r, l)
	case "PUT":
		return c.Put(w, r, l)
	case "DELETE":
		return c.Delete(w, r, l)
	case "CONNECT":
		return c.Connect(w, r, l)
	case "OPTIONS":
		return c.Options(w, r, l)
	case "TRACE":
		return c.Trace(w, r, l)
	case "PATCH":
		return c.Patch(w, r, l)
	default:
		return c.Other(r.Method, w, r, l)
	}
}
