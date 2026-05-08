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

package rw

// ReaderFunc is a function type that matches the io.Reader.Read signature. It
// is used throughout the command layer as a first-class reader argument,
// allowing callers to pass method values without wrapping them in an interface.
type ReaderFunc func(b []byte) (int, error)

// ReadFull calls r repeatedly until b is fully populated or an error occurs.
// It mirrors io.ReadFull but works with ReaderFunc rather than io.Reader.
func ReadFull(r ReaderFunc, b []byte) (int, error) {
	bLen := len(b)
	readed := 0

	for {
		rLen, rErr := r(b[readed:])

		readed += rLen

		if rErr != nil {
			return readed, rErr
		}

		if readed >= bLen {
			return readed, nil
		}
	}
}
