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

package rw

import (
	"bytes"
	"io"
	"testing"
)

func testDummyFetchGen(data []byte) FetchReaderFetcher {
	current := 0

	return func() ([]byte, error) {
		if current >= len(data) {
			return nil, io.EOF
		}

		oldCurrent := current
		current = oldCurrent + 1

		return data[oldCurrent:current], nil
	}
}

func TestFetchReader(t *testing.T) {
	r := NewFetchReader(testDummyFetchGen([]byte("Hello World")))
	b := make([]byte, 11)

	_, rErr := io.ReadFull(&r, b)

	if rErr != nil {
		t.Error("Failed to read due to error:", rErr)

		return
	}

	if !bytes.Equal(b, []byte("Hello World")) {
		t.Errorf("Expecting data to be %s, got %s instead",
			[]byte("Hello World"), b)

		return
	}
}
