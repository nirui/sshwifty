package command

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
)

// Predefined prefixes
const (
	EXECHOOK_ENV_EXCLUDE_PREFIX   = "SSHWIFTY"
	EXECHOOK_ENV_PARAMETER_PREFIX = "SSHWIFTY_HOOK_"
)

// isAllowedExecHookEnv returns true when given `env` is allowed to be passed
// to the ExecHook
func isAllowedExecHookEnv(env string) bool {
	vs := strings.Index(env, "=")
	if vs < 0 {
		return false // No "="? not allowed
	}
	envName := strings.ToUpper(strings.TrimSpace(env[:vs]))
	return !strings.HasPrefix(
		envName,
		EXECHOOK_ENV_EXCLUDE_PREFIX,
	) // Don't leak SSHWIFTY envs
}

// filterExecHookEnviron modifies `env` so it only contain allowed environment
// variables
func filterExecHookEnviron(envs []string) (c int) {
	i := 0
	for ; i < len(envs); i++ {
		if !isAllowedExecHookEnv(envs[i]) {
			continue
		}
		envs[c] = envs[i]
		c++
	}
	return c
}

// buildInitialExecHookEnvirons builds the initial envs for ExecHook instances
func buildInitialExecHookEnvirons() []string {
	envs := os.Environ()
	return envs[:filterExecHookEnviron(envs)]
}

// Pre-initialized data needed by ExecHooks
var (
	defaultHookEnvirons = buildInitialExecHookEnvirons()
)

// ExecHook launches an external process when invoked
type ExecHook []string

// NewExecHook creates a new ExecHook out of given `command`
func NewExecHook(command []string) ExecHook {
	return ExecHook(command)
}

// getWorkDir returns current working directory
func (e ExecHook) getWorkDir() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf(
			"unable to obtain current working directory which is required "+
				"to execute the hook: %s",
			err,
		)
	}
	return wd, nil
}

// mergeParametersWithEnvirons adds given `params` into `environs`
func (e ExecHook) mergeParametersWithEnvirons(
	params HookParameters,
	environs []string,
) []string {
	newEnvs := make([]string, len(environs)+params.Items())
	if copy(newEnvs, environs) != len(environs) {
		panic("Not all environ items were copied")
	}
	params.Iter(func(name, value string) {
		newEnvs = append(newEnvs, strings.Join([]string{
			EXECHOOK_ENV_PARAMETER_PREFIX +
				strings.ToUpper(strings.ReplaceAll(name, " ", "_")),
			value,
		}, "="))
	})
	return newEnvs
}

// Errors for ExecHook.Run
var (
	errExecHookUnspecifiedCommand = errors.New(
		"hook command is unspecified")
)

// Run implements Hook
func (e ExecHook) Run(
	ctx context.Context,
	params HookParameters,
	output HookOutput,
) (err error) {
	if len(e) <= 0 {
		err = errExecHookUnspecifiedCommand
		return
	}

	cmd, args := e[0], e[1:]
	exec := exec.CommandContext(ctx, cmd, args...)
	exec.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	exec.Stdout = HookOutputWriter(output.Out)
	exec.Stderr = HookOutputWriter(output.Err)
	exec.Env = e.mergeParametersWithEnvirons(params, defaultHookEnvirons)
	exec.Dir, err = e.getWorkDir()
	if err != nil {
		return
	}

	err = exec.Run()
	if err != nil {
		return
	}

	// A non-zero exit code should already trigger an error when `exec.Run` is
	// returning, but we still guard it here in case the behaver is inconsistent
	// across different OSs since we can't test them all
	exitCode := exec.ProcessState.ExitCode()
	if exitCode != 0 {
		err = fmt.Errorf("unsuccessfully exited with code: %d", exitCode)
	}
	return
}
