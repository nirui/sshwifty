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

package command

import (
	"bytes"
	"io"
	"sync"
	"testing"

	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/rw"
)

func testDummyFetchGen(data []byte) rw.FetchReaderFetcher {
	current := 0

	return func() ([]byte, error) {
		if current >= len(data) {
			return nil, io.EOF
		}

		oldCurrent := current
		current++

		return data[oldCurrent:current], nil
	}
}

type dummyWriter struct {
	written []byte
}

func (d *dummyWriter) Write(b []byte) (int, error) {
	d.written = append(d.written, b...)

	return len(b), nil
}

func TestHandlerHandleEcho(t *testing.T) {
	w := dummyWriter{
		written: make([]byte, 0, 64),
	}
	s := []byte{
		byte(HeaderControl | 13),
		HeaderControlEcho,
		'H', 'E', 'L', 'L', 'O', ' ', 'W', 'O', 'R', 'L', 'D', '1',
		byte(HeaderControl | 13),
		HeaderControlEcho,
		'H', 'E', 'L', 'L', 'O', ' ', 'W', 'O', 'R', 'L', 'D', '2',
		byte(HeaderControl | HeaderMaxData),
		HeaderControlEcho,
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'1', '1', '1', '1', '1', '1', '1', '1', '1', '1',
		'2', '2',
		byte(HeaderControl | 13),
		HeaderControlEcho,
		'H', 'E', 'L', 'L', 'O', ' ', 'W', 'O', 'R', 'L', 'D', '3',
	}
	lock := sync.Mutex{}
	handler := newHandler(
		Configuration{},
		nil,
		rw.NewFetchReader(testDummyFetchGen(s)),
		&w,
		&lock,
		0,
		0,
		log.NewDitch(),
	)

	hErr := handler.Handle()

	if hErr != nil && hErr != io.EOF {
		t.Error("Failed to write due to error:", hErr)

		return
	}

	if !bytes.Equal(w.written, s) {
		t.Errorf("Expecting the data to be %d, got %d instead", s, w.written)

		return
	}
}
