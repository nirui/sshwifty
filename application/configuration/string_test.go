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
