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

// Package commands – string.go defines the String wire type used in the command
// protocol. A String is a length-prefixed byte sequence where the length is
// encoded as a variable-length Integer.
package commands

import (
	"errors"

	"github.com/Snuffy2/sshwifty/application/rw"
)

// Errors
var (
	ErrStringParseBufferTooSmall = errors.New(
		"not enough buffer space to parse given string")

	ErrStringMarshalBufferTooSmall = errors.New(
		"not enough buffer space to marshal given string")
)

// String is a length-prefixed byte string used in the command wire protocol.
// The length field is stored as a variable-length Integer; data is the raw
// byte payload.
type String struct {
	// len is the encoded length of the data payload.
	len Integer
	// data holds the string bytes, aliased into the caller's buffer.
	data []byte
}

// ParseString decodes a length-prefixed String from reader into the provided
// scratch buffer b. It returns ErrStringParseBufferTooSmall if b cannot hold
// the declared payload length.
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

// NewString constructs a String from raw bytes d. It panics if len(d) exceeds
// MaxInteger, which is the maximum encodable length.
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

// Marshal encodes the String into b, writing the variable-length length prefix
// followed by the data bytes. It returns ErrStringMarshalBufferTooSmall if b
// is not large enough.
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
