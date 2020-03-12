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
	"fmt"
	"io"
	"sync"
	"testing"

	"github.com/niruix/sshwifty/application/log"
	"github.com/niruix/sshwifty/application/rw"
)

func testDummyFetchChainGen(dd <-chan []byte) rw.FetchReaderFetcher {
	var data []byte
	var ok bool

	current := 0

	return func() ([]byte, error) {
		for {
			if current >= len(data) {
				data, ok = <-dd

				if !ok {
					return nil, io.EOF
				}

				current = 0

				continue
			}

			oldCurrent := current
			current++

			return data[oldCurrent:current], nil
		}
	}
}

type dummyStreamCommand struct {
	lock      sync.Mutex
	l         log.Logger
	w         StreamResponder
	downWait  sync.WaitGroup
	echoData  []byte
	echoTrans chan []byte
}

func newDummyStreamCommand(
	l log.Logger,
	w StreamResponder,
	cfg Configuration,
) FSMMachine {
	return &dummyStreamCommand{
		lock:      sync.Mutex{},
		l:         l,
		w:         w,
		downWait:  sync.WaitGroup{},
		echoData:  []byte{},
		echoTrans: make(chan []byte),
	}
}

func (d *dummyStreamCommand) Bootup(
	r *rw.LimitedReader,
	b []byte,
) (FSMState, FSMError) {
	d.downWait.Add(1)

	echoTrans := d.echoTrans

	go func() {
		defer func() {
			d.w.Signal(HeaderClose)

			d.downWait.Done()
		}()

		buf := make([]byte, 1024)

		for {
			dt, dtOK := <-echoTrans

			if !dtOK {
				return
			}

			wErr := d.w.Send(0, []byte{dt[0], dt[1], dt[2], dt[3]}, buf)

			if wErr != nil {
				return
			}
		}
	}()

	commandDataBuf := [5]byte{}

	_, rErr := io.ReadFull(r, commandDataBuf[:])

	if rErr != nil {
		return nil, ToFSMError(rErr, 11)
	}

	if !bytes.Equal(commandDataBuf[:], []byte("HELLO")) {
		panic(fmt.Sprintf("Expecting handsake data to be %s, got %s instead",
			[]byte("HELLO"), commandDataBuf[:]))
	}

	if !r.Completed() {
		panic("R must be Completed")
	}

	return d.run, NoFSMError()
}

func (d *dummyStreamCommand) run(
	f *FSM, r *rw.LimitedReader, h StreamHeader, b []byte) error {
	rLen, rErr := rw.ReadUntilCompleted(r, b[:])

	if rErr != nil {
		return rErr
	}

	d.echoData = make([]byte, rLen)
	copy(d.echoData, b)

	d.lock.Lock()
	defer d.lock.Unlock()

	if d.echoTrans != nil {
		d.echoTrans <- d.echoData
	}

	return nil
}

func (d *dummyStreamCommand) Close() error {
	close(d.echoTrans)

	d.lock.Lock()
	d.echoTrans = nil
	d.lock.Unlock()

	d.downWait.Wait()

	return nil
}

func (d *dummyStreamCommand) Release() error {
	return nil
}

func TestHandlerHandleStream(t *testing.T) {
	cmds := Commands{}
	cmds.Register(0, "name", newDummyStreamCommand, nil)

	readerDataInput := make(chan []byte)

	readerSource := testDummyFetchChainGen(readerDataInput)
	wBuffer := bytes.NewBuffer(make([]byte, 0, 1024))

	lock := sync.Mutex{}
	hhd := newHandler(
		Configuration{},
		&cmds,
		rw.NewFetchReader(readerSource),
		wBuffer,
		&lock,
		0,
		0,
		log.NewDitch())

	go func() {
		stInitialHeader := streamInitialHeader{}

		stInitialHeader.set(0, 5, true)

		readerDataInput <- []byte{
			byte(HeaderStream | 63), stInitialHeader[0], stInitialHeader[1],
			'H', 'E', 'L', 'L', 'O',
		}

		stHeader := StreamHeader{}
		stHeader.Set(0, 5)

		readerDataInput <- []byte{
			byte(HeaderStream | 63), stHeader[0], stHeader[1],
			'W', 'O', 'R', 'L', 'D',
		}

		readerDataInput <- []byte{
			byte(HeaderStream | 63), stHeader[0], stHeader[1],
			'0', '1', '2', '3', '4',
		}

		readerDataInput <- []byte{
			byte(HeaderClose | 63),
		}

		close(readerDataInput)
	}()

	hErr := hhd.Handle()

	if hErr != nil && hErr != io.EOF {
		t.Error("Failed to handle due to error:", hErr)

		return
	}

	// Build the expected header:

	// HeaderStream(63): Success
	stInitialHeader := streamInitialHeader{}
	stInitialHeader.set(0, 0, true)

	stHeaders := StreamHeader{}
	stHeaders.Set(0, 4)

	expected := []byte{
		// HeaderStream(63): Success
		byte(HeaderStream | 63), stInitialHeader[0], stInitialHeader[1],

		// HeaderStream(63): Echo 'W', 'O', 'R', 'L' (First 4 bytes of data)
		byte(HeaderStream | 63), stHeaders[0], stHeaders[1], 'W', 'O', 'R', 'L',

		// HeaderStream(63): Echo '0', '1', '2', '3',
		byte(HeaderStream | 63), stHeaders[0], stHeaders[1], '0', '1', '2', '3',

		// HeaderClose(63)
		byte(HeaderClose | 63),

		// HeaderCompleted(63)
		byte(HeaderCompleted | 63),
	}

	if !bytes.Equal(wBuffer.Bytes(), expected) {
		t.Errorf("Expecting received data to be %d, got %d instead",
			expected, wBuffer.Bytes())

		return
	}
}
