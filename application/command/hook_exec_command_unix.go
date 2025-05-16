//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd

package command

import (
	"os/exec"
	"syscall"
)

// configureExecCommand configures given `e` for Unix-like systems
func configureExecCommand(e *exec.Cmd) {
	e.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
