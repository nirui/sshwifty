package controller

import (
	"fmt"
	"net/http"

	"github.com/nirui/sshwifty/application/log"
)

func serveDataInterface(
	c controller,
	w *ResponseWriter,
	r *http.Request,
	l log.Logger,
) error {
	wh := w.Header()
	wh.Add("Cache-Control", "no-store")
	return serveController(c, w, r, l)
}

type internalInterfaceController interface {
	controller
	accessAllowedMethods() string
	accessAllowedHeaders() string
}

func serveInternalDataInterface(
	c internalInterfaceController,
	w *ResponseWriter,
	r *http.Request,
	l log.Logger,
	originVerifier originVerifier,
) error {
	requestOrigin := r.Header.Get("Origin")
	actualOrigin, accepted, err := originVerifier.acceptable(
		requestOrigin,
		r.Host,
	)
	setAccessControlAllowHeaders(
		r,
		w.Header(),
		actualOrigin,
		c.accessAllowedMethods(),
		c.accessAllowedHeaders(),
	)
	if err != nil {
		return NewError(http.StatusBadRequest, err.Error())
	}
	if !accepted {
		return NewError(http.StatusBadRequest, fmt.Errorf(
			"sending request from Origin %q is not allowed",
			requestOrigin,
		).Error())
	}
	return serveDataInterface(c, w, r, l)
}
