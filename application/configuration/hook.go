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

// HookType is a type of Hook
type HookType string

// Defined Hook Types
const (
	HOOK_BEFORE_CONNECTING HookType = "before_connecting"
)

// verifyHookName returns the HookType of given `name`
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

// HookCommand contains a single Hook command
type HookCommand []string

// Hooks contains registered Hooks
type Hooks map[HookType][]HookCommand

// verify verifies all settings in current Hooks
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

// HookSettings contains Hook settings
type HookSettings struct {
	Timeout time.Duration
	Hooks   Hooks
}
