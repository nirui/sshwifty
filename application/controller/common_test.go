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

package controller

import (
	"net/http"
	"testing"
)

func TestClientContentEtagIsValid(t *testing.T) {
	test := func(id int, hd []string, etag string, expected bool) {
		r := http.Request{
			Header: http.Header{
				"If-None-Match": hd,
			},
		}
		rr := clientContentEtagIsValid(&r, etag)

		if rr != expected {
			t.Errorf("Test: %d: Expecting the result to be %v, got %v instead",
				id, expected, rr)

			return
		}
	}

	test(0, []string{""}, "test", false)
	test(1, []string{"*"}, "test", true)
	test(2, []string{"W/\"67ab43\", \"54ed21\", \"7892dd\""}, "54ed21", true)
	test(3, []string{"\"bfc13a64729c4290ef5b2c2730249c88ca92d82d\""},
		"bfc13a64729c4290ef5b2c2730249c88ca92d82d", true)
}
