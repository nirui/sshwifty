// hook_exec.go implements ExecHook, which satisfies the Hook interface by
// launching an external OS process. Hook parameters are injected as environment
// variables prefixed with SSHWIFTY_HOOK_, while all existing SSHWIFTY_*
// variables are stripped to prevent credential leakage.
package command

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// EXECHOOK_ENV_EXCLUDE_PREFIX is the prefix used to identify environment
// variables that must not be forwarded to hook processes, preventing
// accidental exposure of Sshwifty internal secrets.
// EXECHOOK_ENV_PARAMETER_PREFIX is prepended to each hook parameter name when
// injecting it as an environment variable, e.g. "Remote Address" becomes
// "SSHWIFTY_HOOK_REMOTE_ADDRESS".
const (
	EXECHOOK_ENV_EXCLUDE_PREFIX   = "SSHWIFTY"
	EXECHOOK_ENV_PARAMETER_PREFIX = "SSHWIFTY_HOOK_"
)

// isAllowedExecHookEnv returns true when the given key=value environment entry
// should be forwarded to an ExecHook process. Entries whose name (before '=')
// begins with EXECHOOK_ENV_EXCLUDE_PREFIX are rejected; malformed entries
// without '=' are also rejected.
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

// filterExecHookEnviron compacts envs in-place, keeping only entries that pass
// isAllowedExecHookEnv. It returns the count of allowed entries; the first c
// elements of envs are valid after the call.
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

// buildInitialExecHookEnvirons captures the current process environment at
// startup and removes any SSHWIFTY_* variables, producing the filtered base
// environment that all ExecHook instances will inherit.
func buildInitialExecHookEnvirons() []string {
	envs := os.Environ()
	return envs[:filterExecHookEnviron(envs)]
}

// defaultHookEnvirons holds the filtered process environment captured once at
// init time and shared across all ExecHook instances to avoid repeated calls to
// os.Environ.
var (
	defaultHookEnvirons = buildInitialExecHookEnvirons()
)

// ExecHook is a Hook implementation that executes an external OS command. The
// slice elements are the command path followed by its arguments. Hook
// parameters are passed as SSHWIFTY_HOOK_* environment variables. Standard
// output is forwarded to HookOutput.Out and standard error to HookOutput.Err.
type ExecHook []string

// NewExecHook creates a new ExecHook from the given command slice, where the
// first element is the executable path and the remaining elements are arguments.
func NewExecHook(command []string) ExecHook {
	return ExecHook(command)
}

// getWorkDir returns the current working directory for use as the hook
// process's working directory. It returns a descriptive error if the directory
// cannot be determined.
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

// mergeParametersWithEnvirons returns a new environment slice that contains
// all entries from environs followed by each param in params encoded as
// SSHWIFTY_HOOK_<NAME>=<value> (spaces in the name are replaced with
// underscores and the name is upper-cased).
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

// errExecHookUnspecifiedCommand is returned by ExecHook.Run when the hook has
// an empty command slice and there is nothing to execute.
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
	configureExecCommand(exec)
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
