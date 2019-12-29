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
	"errors"
	"io"
)

// Errors
var (
	ErrReadUntilCompletedBufferFull = errors.New(
		"Cannot read more, not enough data buffer")
)

// LimitedReader reads only n bytes of data
type LimitedReader struct {
	r *FetchReader
	n int
}

// ReadUntilCompleted read until the reader is completed
func ReadUntilCompleted(r *LimitedReader, b []byte) (int, error) {
	bCur := 0
	bLen := len(b)

	for !r.Completed() {
		if bCur >= bLen {
			return bCur, ErrReadUntilCompletedBufferFull
		}

		rLen, rErr := r.Read(b[bCur:])

		if rErr != nil {
			return bCur + rLen, rErr
		}

		bCur += rLen
	}

	return bCur, nil
}

// NewLimitedReader creates a new LimitedReader
func NewLimitedReader(r *FetchReader, n int) LimitedReader {
	return LimitedReader{
		r: r,
		n: n,
	}
}

// Buffered exports the internal buffer
func (l *LimitedReader) Buffered() ([]byte, error) {
	return l.Fetch(l.Remains())
}

// Fetch fetchs max n bytes from buffer
func (l *LimitedReader) Fetch(n int) ([]byte, error) {
	if l.Completed() {
		return nil, io.EOF
	}

	if n > l.Remains() {
		n = l.Remains()
	}

	exported, eErr := l.r.Fetch(n)

	l.n -= len(exported)

	return exported, eErr
}

// Read read from the LimitedReader
func (l *LimitedReader) Read(b []byte) (int, error) {
	if l.Completed() {
		return 0, io.EOF
	}

	toRead := len(b)

	if toRead > l.Remains() {
		toRead = l.Remains()
	}

	rLen, rErr := l.r.Read(b[:toRead])

	l.n -= rLen

	return rLen, rErr
}

// Ditch ditchs all remaining data. Data will be written and overwritten to
// the given buf when ditching
func (l *LimitedReader) Ditch(buf []byte) error {
	for !l.Completed() {
		_, rErr := l.Read(buf)

		if rErr != nil {
			return rErr
		}
	}

	return nil
}

// Remains returns how many bytes is waiting to be read
func (l LimitedReader) Remains() int {
	return l.n
}

// Completed returns whether or not current reader is completed
func (l LimitedReader) Completed() bool {
	return l.n <= 0
}
