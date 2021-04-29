// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2021 NI Rui <ranqus@gmail.com>
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

package configuration

import (
	"os"
	"testing"
)

func TestStringString(t *testing.T) {
	ss := String("aaaaaaaaaaaaa")

	result, err := ss.Parse()

	if err != nil {
		t.Error("Unable to parse:", err)

		return
	}

	if result != "aaaaaaaaaaaaa" {
		t.Errorf(
			"Expecting the result to be %s, got %s instead",
			"aaaaaaaaaaaaa",
			result,
		)

		return
	}
}

func TestStringFile(t *testing.T) {
	const testFilename = "sshwifty.configuration.test.string.file.tmp"

	filePath := os.TempDir() + string(os.PathSeparator) + testFilename

	f, err := os.Create(filePath)

	if err != nil {
		t.Error("Unable to create file:", err)

		return
	}

	defer os.Remove(filePath)

	f.WriteString("TestAAAA")
	f.Close()

	ss := String("file://" + filePath)

	result, err := ss.Parse()

	if err != nil {
		t.Error("Unable to parse:", err)

		return
	}

	if result != "TestAAAA" {
		t.Errorf(
			"Expecting the result to be %s, got %s instead",
			"TestAAAA",
			result,
		)

		return
	}

	ss = String("file://" + filePath + ".notexist")

	result, err = ss.Parse()

	if err == nil {
		t.Error("Parsing an non-existing file should result an error")

		return
	}
}
