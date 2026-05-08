package configuration

// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2025 Ni Rui <ranqus@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import (
	"fmt"
	"time"
)

// HookType is the string identifier for a lifecycle hook event. It is used as
// the map key in the Hooks configuration to associate commands with events.
type HookType string

// HOOK_BEFORE_CONNECTING is the hook type fired immediately before an outbound
// connection attempt is made, allowing operators to run pre-flight scripts.
const (
	HOOK_BEFORE_CONNECTING HookType = "before_connecting"
)

// verify returns nil if h is a recognised HookType, or a descriptive error
// listing the supported types if it is not.
func (h HookType) verify() error {
	switch h {
	case "before_connecting":
		return nil
	default:
		return fmt.Errorf(
			"unsupported Hook type: %q. Supported types are: %q",
			h,
			[]HookType{
				HOOK_BEFORE_CONNECTING,
			},
		)
	}
}

// HookCommand is a single executable command and its arguments, represented as
// a string slice where element 0 is the executable path.
type HookCommand []string

// Hooks maps each HookType to the ordered list of commands to run when that
// hook fires. Multiple commands may be registered for the same type.
type Hooks map[HookType][]HookCommand

// verify validates all HookType keys and their command lists, returning a
// descriptive error if any key is unsupported or any command list is empty or
// contains an empty command.
func (h Hooks) verify() error {
	for k, v := range h {
		if err := k.verify(); err != nil {
			return err
		}
		if len(v) <= 0 {
			continue
		}
		for i := range v {
			if len(v[i]) <= 0 {
				return fmt.Errorf(
					"the command %d for Hook type %q must not be empty",
					i,
					k,
				)
			}
		}
	}
	return nil
}

// HookSettings bundles the hook command registry with the shared execution
// timeout. It is derived from a Configuration and passed into the command layer
// via Common.
type HookSettings struct {
	// Timeout is the maximum duration any single hook invocation may run.
	Timeout time.Duration
	// Hooks is the map of hook types to their ordered command lists.
	Hooks Hooks
}
