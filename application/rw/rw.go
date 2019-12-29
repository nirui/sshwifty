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

// ReaderFunc function of io.Reader
type ReaderFunc func(b []byte) (int, error)

// ReadFull Read until given b is fully loaded
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
