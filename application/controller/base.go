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

	"github.com/niruix/sshwifty/application/log"
)

// Error
var (
	ErrControllerNotImplemented = NewError(
		http.StatusNotImplemented, "Server does not know how to handle the "+
			"request")
)

type controller interface {
	Get(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Head(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Post(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Put(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Delete(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Connect(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Options(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Trace(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Patch(w http.ResponseWriter, r *http.Request, l log.Logger) error
	Other(
		method string,
		w http.ResponseWriter,
		r *http.Request,
		l log.Logger,
	) error
}

type baseController struct{}

func (b baseController) Get(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Head(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Post(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Put(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Delete(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Connect(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Options(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Trace(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Patch(
	w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func (b baseController) Other(
	method string, w http.ResponseWriter, r *http.Request, l log.Logger) error {
	return ErrControllerNotImplemented
}

func serveController(
	c controller,
	w http.ResponseWriter,
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
