// Package command – hooks.go defines the Hook interface, its parameter and
// output abstractions, the registry that maps HookTypes to Hook slices, and the
// Hooks aggregate that executes all registered hooks for a given event with a
// shared timeout.
package command

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Snuffy2/sshwifty/application/configuration"
	"github.com/Snuffy2/sshwifty/application/log"
)

// HookParameters is a string-to-string map of named values passed to a hook
// when it is executed. Parameter names are arbitrary but conventions are
// established by each hook event type (e.g. "Remote Address").
type HookParameters map[string]string

// NewHookParameters creates an empty HookParameters with the given initial
// capacity to avoid unnecessary reallocations when inserting known keys.
func NewHookParameters(initialCapacity int) HookParameters {
	return make(HookParameters, initialCapacity)
}

// Insert inserts or replace the value to given `val` under parameter name
// `name`, return a new HookParameters with the new value applied
func (p HookParameters) Insert(name string, val string) HookParameters {
	p[name] = val
	return p
}

// Items returns how many parameter items is in current HookParameters
func (p HookParameters) Items() int {
	return len(p)
}

// HookParameterIterator is a callback invoked for each name/value pair in a
// HookParameters map by the Iter method.
type HookParameterIterator func(name string, value string)

// Iter iterate through all items contained in current HookParameters
func (p HookParameters) Iter(iter HookParameterIterator) {
	for k, v := range p {
		iter(k, v)
	}
}

// Hook is the interface that all hook implementations must satisfy. Run is
// called with a context (which carries the execution deadline), the event
// parameters, and an output sink. It must return nil on success; any returned
// error is collected and reported by Hooks.Run.
type Hook interface {
	Run(ctx context.Context, params HookParameters, output HookOutput) error
}

// HookOutput is the sink provided to a Hook implementation so it can stream
// informational output back to the connected client while it runs. Out receives
// normal (stdout-equivalent) output; Err receives diagnostic (stderr-equivalent)
// output, which is also logged at INFO level.
type HookOutput interface {
	Out(b []byte) (wLen int, wErr error)
	Err(b []byte) (wLen int, wErr error)
}

// HookOutputWriter is a function type that adapts a write callback to
// io.Writer, allowing it to be passed as exec.Cmd.Stdout or exec.Cmd.Stderr.
type HookOutputWriter func(b []byte) (wLen int, wErr error)

// Write implements io.Writer
func (w HookOutputWriter) Write(b []byte) (int, error) {
	return w(b)
}

// DefaultHookOutput is the standard HookOutput implementation: normal output is
// forwarded via out to the client stream, while error output is written to the
// application log at INFO level and silently discarded from the wire.
type DefaultHookOutput struct {
	// log is used to record stderr output from the hook process.
	log log.Logger
	// out sends stdout bytes from the hook to the client.
	out HookOutputWriter
}

// NewDefaultHookOutput creates a new DefaultHookOutput
func NewDefaultHookOutput(
	log log.Logger,
	out HookOutputWriter,
) DefaultHookOutput {
	return DefaultHookOutput{
		log: log,
		out: out,
	}
}

// Out implements HookOutput
func (d DefaultHookOutput) Out(b []byte) (wLen int, wErr error) {
	return d.out(b)
}

// Err implements HookOutput
func (d DefaultHookOutput) Err(b []byte) (wLen int, wErr error) {
	d.log.Info("Server hook reported: %q", b)
	return len(b), nil
}

// HookConfiguration holds the runtime limits applied to each hook invocation.
type HookConfiguration struct {
	// Timeout is the maximum duration a hook execution may run before the
	// context is cancelled.
	Timeout time.Duration
}

// hookTypes maps each HookType to the slice of Hook instances registered for it.
type hookTypes map[configuration.HookType][]Hook

// acquire returns the slice of hooks registered under t, and whether any were
// found. The returned slice must not be modified.
func (h *hookTypes) acquire(t configuration.HookType) (p []Hook, got bool) {
	p, got = (*h)[t]
	return
}

// register appends hook p to the list of hooks for type t, allocating the
// list if this is the first registration for that type.
func (h *hookTypes) register(t configuration.HookType, p Hook) {
	ps, found := (*h)[t]
	if !found {
		ps = make([]Hook, 0, 1)
	}
	ps = append(ps, p)
	(*h)[t] = ps
}

// Hooks aggregates all registered Hook instances grouped by HookType together
// with the shared timeout configuration. Use NewHooks to construct one from
// a configuration.HookSettings value.
type Hooks struct {
	// hooks maps each HookType to the ordered list of Hook instances.
	hooks hookTypes
	// cfg holds the runtime limits applied to each hook invocation.
	cfg HookConfiguration
}

// createHookForCommand wraps the given command slice in an ExecHook, adapting
// the command configuration format to the Hook interface.
func createHookForCommand(command []string) Hook {
	return NewExecHook(command)
}

// NewHooks creates a Hooks
func NewHooks(cfg configuration.HookSettings) Hooks {
	hooks := make(hookTypes, len(cfg.Hooks))
	for k, v := range cfg.Hooks {
		for i := range v {
			hooks.register(k, createHookForCommand(v[i]))
		}
	}

	return Hooks{
		hooks: hooks,
		cfg: HookConfiguration{
			Timeout: cfg.Timeout,
		},
	}
}

// hooksExecDeadlineFormat is the time format used to inject the absolute
// deadline timestamp into hook parameters as the "Deadline" key.
const (
	hooksExecDeadlineFormat = time.RFC3339
)

// Run executes all hooks registered under type t in order, injecting a
// "Deadline" parameter and enforcing the configured timeout via a derived
// context. Errors from individual hooks are collected and joined; the first
// hook failure does not prevent subsequent hooks from running.
func (h *Hooks) Run(
	ctx context.Context,
	t configuration.HookType,
	params HookParameters,
	output HookOutput,
) error {
	ps, found := h.hooks.acquire(t)
	if !found {
		return nil
	}

	params = params.Insert(
		"Deadline",
		time.Now().Add(h.cfg.Timeout).Format(hooksExecDeadlineFormat),
	)

	timeoutCtx, timeoutCtxCancel := context.WithTimeout(ctx, h.cfg.Timeout)
	defer timeoutCtxCancel()

	errs := make([]error, 0, len(ps))
	for i := range ps {
		err := ps[i].Run(timeoutCtx, params, output)
		if err == nil {
			continue
		}
		errs = append(errs, fmt.Errorf(
			"server hook %d encountered an operational failure: %s",
			i,
			err,
		))
	}
	return errors.Join(errs...)
}
