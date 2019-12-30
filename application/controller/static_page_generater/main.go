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

package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"io/ioutil"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"text/template"
	"time"
)

const (
	parentPackage = "github.com/niruix/sshwifty/application/controller"
)

const (
	staticListTemplate = `import "time"

var (
	staticPages = map[string]staticData{
		{{ range . }}"{{ .Name }}":
			parseStaticData({{ .GOPackage }}.{{ .GOVariableName }}()),
		{{ end }}
	}
)

// parseStaticData parses result from a static file returner and generate
// a new ` + "`" + `staticData` + "`" + ` item
func parseStaticData(
	fileStart int,
	fileEnd int,
	compressedStart int,
	compressedEnd int,
	contentHash string,
	compressedHash string,
	creation time.Time,
	data []byte,
	contentType string,
) staticData {
	return staticData{
		data: data[fileStart:fileEnd],
		dataHash: contentHash,
		compressd: data[compressedStart:compressedEnd],
		compressdHash: compressedHash,
		created: creation,
		contentType: contentType,
	}
}
`

	staticListTemplateDev = `import "io/ioutil"
import "bytes"
import "fmt"
import "compress/gzip"
import "encoding/base64"
import "time"
import "crypto/sha256"
import "mime"
import "strings"

// WARNING: THIS GENERATION IS FOR DEBUG / DEVELOPMENT ONLY, DO NOT
// USE IT IN PRODUCTION!

func getMimeTypeByExtension(ext string) string {
	switch ext {
	case ".ico":
		return "image/x-icon"

	case ".md":
		return "text/markdown"

	default:
		return mime.TypeByExtension(ext)
	}
}

func staticFileGen(fileName, filePath string) staticData {
	content, readErr := ioutil.ReadFile(filePath)

	if readErr != nil {
		panic(fmt.Sprintln("Cannot read file:", readErr))
	}

	compressed := bytes.NewBuffer(make([]byte, 0, 1024))

	compresser, compresserBuildErr := gzip.NewWriterLevel(
		compressed, gzip.BestSpeed)

	if compresserBuildErr != nil {
		panic(fmt.Sprintln("Cannot build data compresser:", compresserBuildErr))
	}

	contentLen := len(content)

	_, compressErr := compresser.Write(content)

	if compressErr != nil {
		panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
	}

	compressErr = compresser.Flush()

	if compressErr != nil {
		panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
	}

	content = append(content, compressed.Bytes()...)

	getHash := func(b []byte) []byte {
		h := sha256.New()
		h.Write(b)

		return h.Sum(nil)
	}

	fileExtDotIdx := strings.LastIndex(fileName, ".")
	fileExt := ""

	if fileExtDotIdx >= 0 {
		fileExt = fileName[fileExtDotIdx:len(fileName)]
	}

	mimeType := getMimeTypeByExtension(fileExt)

	if len(mimeType) <= 0 {
		mimeType = "application/binary"
	}

	return staticData{
		data: content[0:contentLen],
		contentType: mimeType,
		dataHash: base64.StdEncoding.EncodeToString(
			getHash(content[0:contentLen])[:8]),
		compressd: content[contentLen:],
		compressdHash: base64.StdEncoding.EncodeToString(
			getHash(content[contentLen:])[:8]),
		created: time.Now(),
	}
}

var (
	staticPages = map[string]staticData{
		{{ range . }}"{{ .Name }}": staticFileGen(
			"{{ .Name }}", "{{ .Path }}",
		),
		{{ end }}
	}
)`

	staticPageTemplate = `package {{ .GOPackage }}

// This file is part of Sshwifty Project
//
// Copyright (C) {{ .Date.Year }} Rui NI (nirui@gmx.com)
//
// https://github.com/niruix/sshwifty
//
// This file is generated at {{ .Date.Format "Mon, 02 Jan 2006 15:04:05 MST" }}
// by "go generate", DO NOT EDIT! Also, do not open this file, it maybe too large
// for your editor. You've been warned.
//
// This file may contain third-party binaries. See DEPENDENCIES.md for detail.

import (
	"time"
)

// {{ .GOVariableName }} returns static file
func {{ .GOVariableName }}() (
	int,        // FileStart
	int,        // FileEnd
	int,        // CompressedStart
	int,        // CompressedEnd
	string,     // ContentHash
	string,     // CompressedHash
	time.Time,  // Time of creation
	[]byte,     // Data
	string,     // ContentType
) {
	created, createErr := time.Parse(
		time.RFC1123, "{{ .Date.Format "Mon, 02 Jan 2006 15:04:05 MST" }}")

	if createErr != nil {
		panic(createErr)
	}

	return {{ .FileStart }}, {{ .FileEnd }},
		{{ .CompressedStart }}, {{ .CompressedEnd }},
		"{{ .ContentHash }}", "{{ .CompressedHash }}",
		created, []byte({{ .Data }}), "{{ .ContentType }}"
}
`
)

const (
	templateStarts = "//go:generate"
)

type parsedFile struct {
	Name            string
	GOVariableName  string
	GOFileName      string
	GOPackage       string
	Path            string
	Data            string
	Type            string
	FileStart       int
	FileEnd         int
	CompressedStart int
	CompressedEnd   int
	ContentType     string
	ContentHash     string
	CompressedHash  string
	Date            time.Time
}

func getHash(b []byte) []byte {
	h := sha256.New()
	h.Write(b)

	return h.Sum(nil)
}

func buildListFile(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageList").Parse(staticListTemplate))

	return tpl.Execute(w, data)
}

func buildListFileDev(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageList").Parse(staticListTemplateDev))

	return tpl.Execute(w, data)
}

func buildDataFile(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageData").Parse(staticPageTemplate))

	return tpl.Execute(w, data)
}

func byteToQuotedString(b []byte) string {
	return fmt.Sprintf("%q", b)
}

func getMimeTypeByExtension(ext string) string {
	switch ext {
	case ".ico":
		return "image/x-icon"

	case ".md":
		return "text/markdown"

	case ".woff":
		return "application/font-woff"

	case ".woff2":
		return "application/font-woff2"

	default:
		return mime.TypeByExtension(ext)
	}
}

func parseFile(
	id int, name string, filePath string, packageName string) parsedFile {
	content, readErr := ioutil.ReadFile(filePath)

	if readErr != nil {
		panic(fmt.Sprintln("Cannot read file:", readErr))
	}

	contentLen := len(content)

	fileExtDotIdx := strings.LastIndex(name, ".")
	fileExt := ""

	if fileExtDotIdx >= 0 {
		fileExt = name[fileExtDotIdx:len(name)]
	}

	mimeType := getMimeTypeByExtension(fileExt)

	if len(mimeType) <= 0 {
		mimeType = "application/binary"
	}

	if strings.HasPrefix(mimeType, "image/") {
		// Don't compress images
	} else if strings.HasPrefix(mimeType, "application/font-woff") {
		// Don't compress web fonts
	} else {
		compressed := bytes.NewBuffer(make([]byte, 0, 1024))

		compresser, compresserBuildErr := gzip.NewWriterLevel(
			compressed, gzip.BestCompression)

		if compresserBuildErr != nil {
			panic(fmt.Sprintln(
				"Cannot build data compresser:", compresserBuildErr))
		}

		_, compressErr := compresser.Write(content)

		if compressErr != nil {
			panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
		}

		compressErr = compresser.Flush()

		if compressErr != nil {
			panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
		}

		content = append(content, compressed.Bytes()...)
	}

	goFileName := "Static" + strconv.FormatInt(int64(id), 10)

	return parsedFile{
		Name:            name,
		GOVariableName:  strings.Title(goFileName),
		GOFileName:      strings.ToLower(goFileName) + "_generated.go",
		GOPackage:       packageName,
		Path:            filePath,
		Data:            byteToQuotedString(content),
		FileStart:       0,
		FileEnd:         contentLen,
		CompressedStart: contentLen,
		CompressedEnd:   len(content),
		ContentType:     mimeType,
		ContentHash: base64.StdEncoding.EncodeToString(
			getHash(content[0:contentLen])[:8]),
		CompressedHash: base64.StdEncoding.EncodeToString(
			getHash(content[contentLen:len(content)])[:8]),
		Date: time.Now(),
	}
}

func main() {
	if len(os.Args) < 3 {
		panic("Usage: <Source Folder> <(Destination) List File>")
	}

	sourcePath, sourcePathErr := filepath.Abs(os.Args[1])

	if sourcePathErr != nil {
		panic(fmt.Sprintf("Invalid source folder path %s: %s",
			os.Args[1], sourcePathErr))
	}

	listFilePath, listFilePathErr := filepath.Abs(os.Args[2])

	if listFilePathErr != nil {
		panic(fmt.Sprintf("Invalid destination list file path %s: %s",
			os.Args[2], listFilePathErr))
	}

	listFileName := filepath.Base(listFilePath)
	destFolderPackage := strings.TrimSuffix(
		listFileName, filepath.Ext(listFileName))
	destFolderPath := filepath.Join(
		filepath.Dir(listFilePath), destFolderPackage)

	destFolderPathErr := os.RemoveAll(destFolderPath)

	if destFolderPathErr != nil {
		panic(fmt.Sprintf("Unable to remove data destination folder %s: %s",
			destFolderPath, destFolderPathErr))
	}

	destFolderPathErr = os.Mkdir(destFolderPath, 0777)

	if destFolderPathErr != nil {
		panic(fmt.Sprintf("Unable to build data destination folder %s: %s",
			destFolderPath, destFolderPathErr))
	}

	listFile, listFileErr := os.OpenFile(listFilePath, os.O_RDWR, 0666)

	if listFileErr != nil {
		panic(fmt.Sprintf("Unable to open destination list file %s: %s",
			listFilePath, listFileErr))
	}

	defer listFile.Close()

	files, dirOpenErr := ioutil.ReadDir(sourcePath)

	if dirOpenErr != nil {
		panic(fmt.Sprintf("Unable to open dir: %s", dirOpenErr))
	}

	scanner := bufio.NewScanner(listFile)
	destBytesByPass := int64(0)
	foundLastLine := false

	for scanner.Scan() {
		text := scanner.Text()

		if strings.Index(text, templateStarts) < 0 {
			if foundLastLine {
				break
			}

			destBytesByPass += int64(len(text) + 1)

			continue
		}

		destBytesByPass += int64(len(text) + 1)
		foundLastLine = true
	}

	listFile.Seek(destBytesByPass, 0)
	listFile.Truncate(destBytesByPass)

	listFile.WriteString("\n// This file is generated by `go generate` at " +
		time.Now().Format(time.RFC1123) + "\n// DO NOT EDIT!\n\n")

	switch os.Getenv("NODE_ENV") {
	case "development":
		type sourceFiles struct {
			Name string
			Path string
		}

		var sources []sourceFiles

		for f := range files {
			if !files[f].Mode().IsRegular() {
				continue
			}

			sources = append(sources, sourceFiles{
				Name: files[f].Name(),
				Path: filepath.Join(sourcePath, files[f].Name()),
			})
		}

		tempBuildErr := buildListFileDev(listFile, sources)

		if tempBuildErr != nil {
			panic(fmt.Sprintf(
				"Unable to build destination file due to error: %s",
				tempBuildErr))
		}

	default:
		var parsedFiles []parsedFile

		for f := range files {
			if !files[f].Mode().IsRegular() {
				continue
			}

			currentFilePath := filepath.Join(sourcePath, files[f].Name())

			parsedFiles = append(parsedFiles, parseFile(
				f, files[f].Name(), currentFilePath, destFolderPackage))
		}

		for f := range parsedFiles {
			fn := filepath.Join(destFolderPath, parsedFiles[f].GOFileName)

			ff, ffErr := os.Create(fn)

			if ffErr != nil {
				panic(fmt.Sprintf("Unable to create static page file %s: %s",
					fn, ffErr))
			}

			bErr := buildDataFile(ff, parsedFiles[f])

			if bErr != nil {
				panic(fmt.Sprintf("Unable to build static page file %s: %s",
					fn, bErr))
			}
		}

		listFile.WriteString(
			"\nimport \"" + parentPackage + "/" + destFolderPackage + "\"\n\n")

		tempBuildErr := buildListFile(listFile, parsedFiles)

		if tempBuildErr != nil {
			panic(fmt.Sprintf(
				"Unable to build destination file due to error: %s",
				tempBuildErr))
		}
	}
}
