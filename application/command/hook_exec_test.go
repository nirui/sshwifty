package command

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/nirui/sshwifty/application/log"
)

func TestFilterExecHookEnviron(t *testing.T) {
	resultEnvs := slices.Clone(os.Environ())
	resultEnvs = append(resultEnvs, "WITHOUT_EQUAL")
	resultEnvs = append(resultEnvs, EXECHOOK_ENV_EXCLUDE_PREFIX+"_TEST1=1")
	resultEnvs = append(resultEnvs, EXECHOOK_ENV_EXCLUDE_PREFIX+"_TEST2=1")
	resultEnvs = resultEnvs[:filterExecHookEnviron(resultEnvs)]
	for i := range resultEnvs {
		if !strings.HasPrefix(resultEnvs[i], EXECHOOK_ENV_EXCLUDE_PREFIX) &&
			strings.Contains(resultEnvs[i], "=") {
			continue
		}
		t.Errorf(
			"Expecting the item %q at %d should be filtered, it did not",
			resultEnvs[i],
			i,
		)
	}
}

func TestExecHookMergeParametersWithEnvirons(t *testing.T) {
	params := NewHookParameters(2).
		Insert("Test 1", "Val1").
		Insert("Test 2", "Val2")
	h := NewExecHook([]string{"/bin/sh", "echo", "Hello World"})
	envs := h.mergeParametersWithEnvirons(params, defaultHookEnvirons)
	if !slices.Contains(envs, EXECHOOK_ENV_PARAMETER_PREFIX+"TEST_1=Val1") {
		t.Errorf(
			"No parameter under name %q in env",
			EXECHOOK_ENV_PARAMETER_PREFIX+"TEST_1=Val1",
		)
	}
	if !slices.Contains(envs, EXECHOOK_ENV_PARAMETER_PREFIX+"TEST_2=Val2") {
		t.Errorf(
			"No parameter under name %q in env",
			EXECHOOK_ENV_PARAMETER_PREFIX+"TEST_2=Val2",
		)
	}
}

type dummyLogger struct {
	c string
	w io.Writer
}

func newDummyLogger(context string, w io.Writer) dummyLogger {
	return dummyLogger{
		c: context,
		w: w,
	}
}

func (w dummyLogger) Context(name string, params ...interface{}) log.Logger {
	return newDummyLogger(w.c+" > "+fmt.Sprintf(name, params...), w.w)
}

func (w dummyLogger) Write(b []byte) (int, error) {
	_, wErr := w.write("DEF", string(b))
	if wErr != nil {
		return 0, wErr
	}
	return len(b), nil
}

func (w dummyLogger) write(
	prefix string, msg string, params ...interface{}) (int, error) {
	return fmt.Fprintf(w.w, "["+prefix+"] "+w.c+": "+msg+"\r\n", params...)
}

func (w dummyLogger) Info(msg string, params ...interface{}) {
	w.write("INF", msg, params...)
}

func (w dummyLogger) Debug(msg string, params ...interface{}) {
	w.write("DBG", msg, params...)
}

func (w dummyLogger) Warning(msg string, params ...interface{}) {
	w.write("WRN", msg, params...)
}

func (w dummyLogger) Error(msg string, params ...interface{}) {
	w.write("ERR", msg, params...)
}

func TestExecHookRun(t *testing.T) {
	h := NewExecHook([]string{
		"/bin/sh",
		"-c",
		"for n in $(seq 1 3); " +
			"do sleep 1 && echo Stdout $SSHWIFTY_HOOK_COMMAND_PARAMETER_1 $n && echo Stderr $SSHWIFTY_HOOK_COMMAND_PARAMETER_1 $n 1>&2; " +
			"done",
	})
	if _, err := os.Stat(h[0]); err != nil {
		t.Skipf("Specified file %s does not exist, test skipped", h[0])
		return
	}
	errOut := bytes.NewBuffer(make([]byte, 0, 128))
	l := newDummyLogger("TestExecHookRun", errOut)
	stdOut := bytes.NewBuffer(make([]byte, 0, 128))
	err := h.Run(
		context.Background(),
		NewHookParameters(2).Insert("Command Parameter 1", "Parameter 1"),
		NewDefaultHookOutput(l, func(b []byte) (wLen int, wErr error) {
			return stdOut.Write(b)
		}),
	)
	if err != nil {
		t.Errorf("Unable to run hook: %s", err)
		return
	}
	var (
		expectedOut = []string{
			"Stdout Parameter 1 1",
			"Stdout Parameter 1 2",
			"Stdout Parameter 1 3",
		}
		expectedErr = []string{
			"[INF] TestExecHookRun: Server hook reported: " +
				"\"Stderr Parameter 1 1\\n\"",
			"[INF] TestExecHookRun: Server hook reported: " +
				"\"Stderr Parameter 1 2\\n\"",
			"[INF] TestExecHookRun: Server hook reported: " +
				"\"Stderr Parameter 1 3\\n\"",
		}
	)
	actualErr := func() []string {
		i := strings.Split(strings.TrimSpace(errOut.String()), "\n")
		o := make([]string, 0, len(i))
		for c := range i {
			o = append(o, strings.TrimSpace(i[c]))
		}
		return o
	}()
	actualOut := func() []string {
		i := strings.Split(strings.TrimSpace(stdOut.String()), "\n")
		o := make([]string, 0, len(i))
		for c := range i {
			o = append(o, strings.TrimSpace(i[c]))
		}
		return o
	}()
	if !slices.Equal(expectedOut, actualOut) {
		t.Errorf(
			"Expecting the output to be %s, got %s instead",
			expectedOut,
			actualOut,
		)
		return
	}
	if !slices.Equal(expectedErr, actualErr) {
		t.Errorf(
			"Expecting the error to be %s, got %s instead",
			expectedErr,
			actualErr,
		)
		return
	}
}
