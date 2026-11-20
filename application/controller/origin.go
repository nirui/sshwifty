package controller

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// extractRequestOrigin extracts Origin from headers `h`
func extractRequestOrigin(originValue string) (*url.URL, error) {
	requestOriginURL, err := url.Parse(originValue)
	if err != nil {
		return nil, fmt.Errorf(
			"%q is not a valid Origin: %s",
			originValue,
			err,
		)
	}
	if len(requestOriginURL.Host) <= 0 || len(requestOriginURL.Scheme) <= 0 {
		return nil, fmt.Errorf(
			"Origin value %q in the request is missing scheme and/or hostname",
			originValue,
		)
	}
	return requestOriginURL, nil
}

// buildOriginValue creates a valid value for Origin header based on given
// `scheme` and `hostname`
func buildOriginValue(scheme string, hostname string) (r *url.URL) {
	r = &url.URL{
		Scheme: scheme,
		Host:   hostname,
	}
	return
}

// allowedOrigins is a list of allowed access origins
type allowedOrigins []string

// contains returns true if given `origin` is contained in the list
func (l allowedOrigins) contains(origin string) bool {
	for i := range l {
		if !strings.EqualFold(origin, l[i]) {
			continue
		}
		return true
	}
	return false
}

// origin is a controller that handles requests that is considered internal
// communications which require extra verification
type originVerifier struct {
	allowedOrigins allowedOrigins
}

// newOriginVerifier creates a new originVerifier
func newOriginVerifier(allowedOrigins allowedOrigins) originVerifier {
	return originVerifier{
		allowedOrigins: allowedOrigins,
	}
}

// Predefined constants for originVerifier.acceptable
const (
	originDefaultScheme = "https"
)

// acceptable checks if given `originValue` is an acceptable Origin value, if so
// the returned `accepted` will be set to true
//
// No matter if an `err` is returned, `selectedOrigin` will always be filled
func (l originVerifier) acceptable(
	originValue string,
	validServerHost string,
) (selectedOrigin string, accepted bool, err error) {
	if len(originValue) <= 0 {
		selectedOrigin = buildOriginValue(
			originDefaultScheme,
			validServerHost,
		).String()
		accepted = true
		return // Origin header missing? Access by default
	}
	var requestOrigin *url.URL
	requestOrigin, err = extractRequestOrigin(originValue)
	if err != nil {
		selectedOrigin = buildOriginValue(
			originDefaultScheme,
			validServerHost,
		).String()
		return // Invalid Origin format, reject
	}
	selectedOrigin = requestOrigin.String()
	// First, check the request URL against a list of user-defined origins,
	// which is much safer than the hostname-only check below
	if l.allowedOrigins.contains(selectedOrigin) {
		accepted = true
		return
	}
	// If the previous check failed, fallback to the hostname-only check so
	// the old deployment still works
	if strings.EqualFold(requestOrigin.Host, validServerHost) {
		accepted = true
		return
	}
	// Create a dummy one with valid server hostname, `accepted` is false so
	// the client is rejected anyways
	selectedOrigin = buildOriginValue(
		requestOrigin.Scheme,
		validServerHost,
	).String()
	return // Reject all other cases
}

// setAccessControlAllowHeaders adds necessary Access-Control-Allow-* headers
// into `h`
func setAccessControlAllowHeaders(
	r *http.Request,
	h http.Header,
	acceptedOrigin string,
	acceptedMethods string,
	acceptedHeaders string,
) {
	if len(r.Header.Get("Origin")) > 0 {
		h.Add("Access-Control-Allow-Origin", acceptedOrigin)
		h.Add("Vary", "Origin")
	}
	if len(r.Header.Get("Access-Control-Request-Method")) > 0 {
		h.Add("Access-Control-Allow-Methods", acceptedMethods)
	}
	if len(r.Header.Get("Access-Control-Request-Headers")) > 0 {
		h.Add("Access-Control-Allow-Headers", acceptedHeaders)
	}
}
