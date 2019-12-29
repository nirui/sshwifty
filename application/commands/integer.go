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
	ErrIntegerMarshalNotEnoughBuffer = errors.New(
		"Not enough buffer to marshal the integer")

	ErrIntegerMarshalTooLarge = errors.New(
		"Integer cannot be marshalled, because the vaule was too large")
)

// Integer is a 16bit unsigned integer data
//
// Format:
// +-------------------------------------+--------------+
// | 1 bit                               | 7 bits       |
// +-------------------------------------+--------------+
// | 1 when current byte is the end byte | Integer data |
// +-------------------------------------+--------------+
//
// Example:
//   - 00000000 00000000: 0
//   - 01111111:          127
//   - 11111111 01000000: 255
type Integer uint16

const (
	integerHasNextBit  = 0x80
	integerValueCutter = 0x7f
)

// Consts
const (
	MaxInteger      = 0x3fff
	MaxIntegerBytes = 2
)

// ByteSize returns how many bytes current integer will be encoded into
func (i *Integer) ByteSize() int {
	if *i > integerValueCutter {
		return 2
	}

	return 1
}

// Int returns a int of current Integer
func (i *Integer) Int() int {
	return int(*i)
}

// Marshal build serialized data of the integer
func (i *Integer) Marshal(b []byte) (int, error) {
	bLen := len(b)

	if *i > MaxInteger {
		return 0, ErrIntegerMarshalTooLarge
	}

	if bLen < i.ByteSize() {
		return 0, ErrIntegerMarshalNotEnoughBuffer
	}

	if *i <= integerValueCutter {
		b[0] = byte(*i & integerValueCutter)

		return 1, nil
	}

	b[0] = byte((*i >> 7) | integerHasNextBit)
	b[1] = byte(*i & integerValueCutter)

	return 2, nil
}

// Unmarshal read data and parse the integer
func (i *Integer) Unmarshal(reader rw.ReaderFunc) error {
	buf := [1]byte{}

	for j := 0; j < MaxIntegerBytes; j++ {
		_, rErr := rw.ReadFull(reader, buf[:])

		if rErr != nil {
			return rErr
		}

		*i |= Integer(buf[0] & integerValueCutter)

		if integerHasNextBit&buf[0] == 0 {
			return nil
		}

		*i <<= 7
	}

	return nil
}
