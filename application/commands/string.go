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
	"errors"

	"github.com/niruix/sshwifty/application/rw"
)

// Errors
var (
	ErrStringParseBufferTooSmall = errors.New(
		"Not enough buffer space to parse given string")

	ErrStringMarshalBufferTooSmall = errors.New(
		"Not enough buffer space to marshal given string")
)

// String data
type String struct {
	len  Integer
	data []byte
}

// ParseString build the String according to readed data
func ParseString(reader rw.ReaderFunc, b []byte) (String, error) {
	lenData := Integer(0)

	mErr := lenData.Unmarshal(reader)

	if mErr != nil {
		return String{}, mErr
	}

	bLen := len(b)

	if bLen < lenData.Int() {
		return String{}, ErrStringParseBufferTooSmall
	}

	_, rErr := rw.ReadFull(reader, b[:lenData])

	if rErr != nil {
		return String{}, rErr
	}

	return String{
		len:  lenData,
		data: b[:lenData],
	}, nil
}

// NewString create a new String
func NewString(d []byte) String {
	dLen := len(d)

	if dLen > MaxInteger {
		panic("Data was too long for a String")
	}

	return String{
		len:  Integer(dLen),
		data: d,
	}
}

// Data returns the data of the string
func (s String) Data() []byte {
	return s.data
}

// Marshal the string to give buffer
func (s String) Marshal(b []byte) (int, error) {
	bLen := len(b)

	if bLen < s.len.ByteSize()+len(s.data) {
		return 0, ErrStringMarshalBufferTooSmall
	}

	mLen, mErr := s.len.Marshal(b)

	if mErr != nil {
		return 0, mErr
	}

	return copy(b[mLen:], s.data) + mLen, nil
}
