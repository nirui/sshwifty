//go:build windows

package command

import (
	"os/exec"
	"syscall"
)

// configureExecCommand configures given `e` for Windows
func configureExecCommand(e *exec.Cmd) {
	e.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
