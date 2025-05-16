//go:build !(darwin || dragonfly || freebsd || linux || netbsd || openbsd || windows)

package command

import "os/exec"

// configureExecCommand configures given `e`
func configureExecCommand(e *exec.Cmd) {
	// By default, do nothing
}
