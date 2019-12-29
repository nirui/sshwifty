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

func testString(t *testing.T, str []byte) {
	ss := NewString(str)
	mm := make([]byte, len(str)+2)

	mLen, mErr := ss.Marshal(mm)

	if mErr != nil {
		t.Error("Failed to marshal:", mErr)

		return
	}

	buf := make([]byte, mLen)
	source := bytes.NewBuffer(mm[:mLen])
	result, rErr := ParseString(source.Read, buf)

	if rErr != nil {
		t.Error("Failed to parse:", rErr)

		return
	}

	if !bytes.Equal(result.Data(), ss.Data()) {
		t.Errorf("Expecting the data to be %d, got %d instead",
			ss.Data(), result.Data())

		return
	}
}

func TestString(t *testing.T) {
	testString(t, []byte{
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
	})

	testString(t, []byte{
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
		'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'i',
	})
}
