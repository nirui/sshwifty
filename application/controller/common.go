// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2023 Ni Rui <ranqus@gmail.com>
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
	"regexp"
	"strings"
)

func clientSupportGZIP(r *http.Request) bool {
	// Should be good enough
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

var (
	serverMessageFormatLink = regexp.MustCompile(`\[(.*?)\]\((.*?)\)`)
)

func parseServerMessage(input string) (result string) {
	// Yep, this is a new low, throwing regexp at a flat text format now...will
	// rewrite the entire thing in a new version with a proper parser, maybe
	// Con: Barely work when we only need to support exactly one text format
	// Pro: Expecting a debugging battle, wrote the thing in one go instead
	found := serverMessageFormatLink.FindAllStringSubmatchIndex(input, -1)
	if len(found) <= 0 {
		return input
	}
	currentStart := 0
	for _, f := range found {
		if len(f) != 6 { // Expecting 6 parameters from the given expression
			return input
		}
		segStart, segEnd, titleStart, titleEnd, linkStart, linkEnd :=
			f[0], f[1], f[2], f[3], f[4], f[5]
		result += input[currentStart:segStart]
		result += "<a href=\"" +
			input[linkStart:linkEnd] +
			"\" target=\"_blank\">" +
			input[titleStart:titleEnd] +
			"</a>"
		currentStart = segEnd
	}
	result += input[currentStart:]
	return
}
