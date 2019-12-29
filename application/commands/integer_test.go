// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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

package commands

import (
	"bytes"
	"testing"
)

func TestInteger(t *testing.T) {
	ii := Integer(0x3fff)
	result := Integer(0)
	buf := make([]byte, 2)

	mLen, mErr := ii.Marshal(buf)

	if mErr != nil {
		t.Error("Failed to marshal:", mErr)

		return
	}

	mData := bytes.NewBuffer(buf[:mLen])
	mErr = result.Unmarshal(mData.Read)

	if mErr != nil {
		t.Error("Failed to unmarshal:", mErr)

		return
	}

	if result != ii {
		t.Errorf("Expecting result to be %d, got %d instead", ii, result)

		return
	}
}

func TestIntegerSingleByte1(t *testing.T) {
	ii := Integer(102)
	result := Integer(0)
	buf := make([]byte, 2)

	mLen, mErr := ii.Marshal(buf)

	if mErr != nil {
		t.Error("Failed to marshal:", mErr)

		return
	}

	if mLen != 1 {
		t.Error("Expecting the Integer to be marshalled into %d bytes, got "+
			"%d instead", 1, mLen)

		return
	}

	mData := bytes.NewBuffer(buf[:mLen])
	mErr = result.Unmarshal(mData.Read)

	if mErr != nil {
		t.Error("Failed to unmarshal:", mErr)

		return
	}

	if result != ii {
		t.Errorf("Expecting result to be %d, got %d instead", ii, result)

		return
	}
}

func TestIntegerSingleByte2(t *testing.T) {
	ii := Integer(127)
	result := Integer(0)
	buf := make([]byte, 2)

	mLen, mErr := ii.Marshal(buf)

	if mErr != nil {
		t.Error("Failed to marshal:", mErr)

		return
	}

	if mLen != 1 {
		t.Error("Expecting the Integer to be marshalled into %d bytes, got "+
			"%d instead", 1, mLen)

		return
	}

	mData := bytes.NewBuffer(buf[:mLen])
	mErr = result.Unmarshal(mData.Read)

	if mErr != nil {
		t.Error("Failed to unmarshal:", mErr)

		return
	}

	if result != ii {
		t.Errorf("Expecting result to be %d, got %d instead", ii, result)

		return
	}
}
