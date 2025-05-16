package command

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/nirui/sshwifty/application/configuration"
	"github.com/nirui/sshwifty/application/log"
)

// HookParameters contains parameters needed to run a hook
type HookParameters map[string]string

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

// HookParameterIterator Iterates through HookParameters
type HookParameterIterator func(name string, value string)

// Iter iterate through all items contained in current HookParameters
func (p HookParameters) Iter(iter HookParameterIterator) {
	for k, v := range p {
		iter(k, v)
	}
}

// Hook represents the instance of a Hook
type Hook interface {
	Run(ctx context.Context, params HookParameters, output HookOutput) error
}

// HookOutput is a controller given by the Hook executer to allow it to output
// running information during the run
type HookOutput interface {
	Out(b []byte) (wLen int, wErr error)
	Err(b []byte) (wLen int, wErr error)
}

// HookOutputWriter wraps a Write function to implement io.Writer
type HookOutputWriter func(b []byte) (wLen int, wErr error)

// Write implements io.Writer
func (w HookOutputWriter) Write(b []byte) (int, error) {
	return w(b)
}

// DefaultHookOutput is the default implementation of a HookOutput
type DefaultHookOutput struct {
	log log.Logger
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

// HookConfiguration contains configuration needed for a Hook run
type HookConfiguration struct {
	Timeout time.Duration
}

// hookTypes contains registered Hooks
type hookTypes map[configuration.HookType][]Hook

// acquire fetches all Hook registered under `t`
func (h *hookTypes) acquire(t configuration.HookType) (p []Hook, got bool) {
	p, got = (*h)[t]
	return
}

// Register register a Hook `p`
func (h *hookTypes) register(t configuration.HookType, p Hook) {
	ps, found := (*h)[t]
	if !found {
		ps = make([]Hook, 0, 1)
	}
	ps = append(ps, p)
	(*h)[t] = ps
}

// Hooks contains all registered hooks
type Hooks struct {
	hooks hookTypes
	cfg   HookConfiguration
}

// createHookForCommand creates a Hook based on given `command`
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

// Constants for Hooks.Run
const (
	hooksExecDeadlineFormat = time.RFC3339
)

// Run runs Hooks of given type `t`
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
