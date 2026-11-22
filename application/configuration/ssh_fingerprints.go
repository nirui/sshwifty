package configuration

import (
	"encoding/base64"
	"fmt"
	"slices"
	"strings"
)

// SSHFingerprints contains a group of a fingerprint
type SSHFingerprints []string

// Has returns true if current SSHFingerprints contains `fingerprint`
func (f SSHFingerprints) Has(fingerprint string) bool {
	return slices.Contains(f, fingerprint)
}

// add adds given `fingerprint` into current SSHFingerprints
func (f *SSHFingerprints) add(fingerprint string) {
	*f = append(*f, fingerprint)
}

// SSHHostFingerprints contains a group of SSH fingerprints
type SSHHostFingerprints map[string]SSHFingerprints

// register adds given `pubKeyFingerprint` under `host`
func (f *SSHHostFingerprints) register(
	pubKeyFingerprint string,
	host string,
) bool {
	old, has := (*f)[host]
	if has {
		return false
	}
	if old.Has(pubKeyFingerprint) {
		return false
	}
	old.add(pubKeyFingerprint)
	(*f)[host] = old
	return true
}

// normalizeHost normalizes hosts
func (f *SSHHostFingerprints) normalizeHost(hosts string) string {
	return strings.ToLower(hosts)
}

// add adds `pubKeyFingerprint` to the given `host`
func (f *SSHHostFingerprints) add(pubKeyFingerprint string, host string) error {
	if f.register(strings.TrimSpace(pubKeyFingerprint), f.normalizeHost(host)) {
		return nil
	}
	return fmt.Errorf(
		"fingerprint %q has already been pinned for %q",
		pubKeyFingerprint,
		host,
	)
}

// Get returns all fingerprints registered under any host in the given list
// `hostAny`
func (f *SSHHostFingerprints) Get(hostAny ...string) (SSHFingerprints, bool) {
	for _, host := range hostAny {
		fp, has := (*f)[f.normalizeHost(host)]
		if !has {
			continue
		}
		return fp, true
	}
	return nil, false
}

// isSupportedSSHFingerprint returns true when `fingerprint` is an acceptable
// SSH fingerprint
func isSupportedSSHFingerprint(fingerprint string) bool {
	beforeCut, afterCut, found := strings.Cut(fingerprint, ":")
	if !found {
		return found
	}
	switch strings.ToUpper(beforeCut) {
	case "SHA256":
		fallthrough
	case "MD5":
	default:
		return false
	}
	_, err := base64.StdEncoding.DecodeString(afterCut)
	return err == nil
}
