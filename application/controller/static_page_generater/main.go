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

// Package main implements the static page generator tool invoked by
// "go generate" in the parent controller package. It reads every regular file
// from a source distribution folder, optionally gzip-compresses each file's
// content, serializes the bytes into a Go source literal, and writes one
// *_generated.go file per asset into a destination sub-package. It also writes
// a list file (static_pages.go) that maps asset names to their generated
// accessor functions. When the NODE_ENV environment variable is set to
// "development", it emits a development-mode list that reads files from disk
// at runtime rather than embedding them as literals.
package main

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"text/template"
	"time"
)

const (
	// parentPackage is the Go import path of the controller package that the
	// generated sub-package belongs to. It is used when writing import
	// directives into the static page list file.
	parentPackage = "github.com/Snuffy2/sshwifty/application/controller"
)

// Template constants used to generate the static page list file and the
// individual per-asset Go source files. Each constant is a Go text/template
// string that is rendered with a slice of parsedFile values as its data.
const (
	staticListHeader = `// Sshwifty - A Web SSH client
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

package controller

`

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
	creation time.Time,
	data []byte,
	contentType string,
) staticData {
	return staticData{
		data: data[fileStart:fileEnd],
		compressed: data[compressedStart:compressedEnd],
		created: creation,
		contentType: contentType,
	}
}
`

	staticListTemplateDev = `import "os"
import "bytes"
import "fmt"
import "compress/gzip"
import "time"
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

func compressContent(compressed *bytes.Buffer, content []byte) {
	compressor, compressorBuildErr := gzip.NewWriterLevel(
		compressed, gzip.BestSpeed)
	if compressorBuildErr != nil {
		panic(fmt.Sprintln("Cannot build data compressor:", compressorBuildErr))
	}
	defer compressor.Close()
	written := 0
	for len(content) > written {
		wLen, compressErr := compressor.Write(content[written:])
		if compressErr != nil {
			panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
		}
		written += wLen
	}
}

func staticFileGen(fileName, filePath string) staticData {
	content, readErr := os.ReadFile(filePath)
	if readErr != nil {
		panic(fmt.Sprintln("Cannot read file:", readErr))
	}
	compressed := bytes.NewBuffer(make([]byte, 0, 1024))
	compressContent(compressed, content)
	contentLen := len(content)
	content = append(content, compressed.Bytes()...)
	fileExtDotIdx := strings.LastIndex(fileName, ".")
	fileExt := ""
	if fileExtDotIdx >= 0 {
		fileExt = fileName[fileExtDotIdx:]
	}
	mimeType := getMimeTypeByExtension(fileExt)
	if len(mimeType) <= 0 {
		mimeType = "application/binary"
	}
	return staticData{
		data: content[0:contentLen],
		contentType: mimeType,
		compressed: content[contentLen:],
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
// Copyright (C) {{ .Date.Year }} Ni Rui (ranqus@gmail.com)
//
// https://github.com/Snuffy2/sshwifty
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
		created, []byte({{ .Data }}), "{{ .ContentType }}"
}
`
)

// parsedFile holds all metadata and content needed to emit both the per-asset
// generated Go file and the entry in the static page list.
type parsedFile struct {
	// Name is the original filename as it appears in the source distribution
	// folder and as the map key in the generated list file.
	Name string
	// GOVariableName is the exported Go identifier used for this file's
	// accessor function (e.g. "STATIC42").
	GOVariableName string
	// GOFileName is the basename of the generated .go file for this asset.
	GOFileName string
	// GOPackage is the Go package name of the generated sub-package.
	GOPackage string
	// Path is the absolute filesystem path of the source file.
	Path string
	// Data is the Go quoted-string literal containing the (optionally
	// compressed) raw bytes of the file.
	Data string
	// Type is reserved and currently unused.
	Type string
	// FileStart is the byte offset within Data where the uncompressed content
	// begins (always 0).
	FileStart int
	// FileEnd is the byte offset within Data where the uncompressed content
	// ends (equal to the uncompressed file size).
	FileEnd int
	// CompressedStart is the byte offset within Data where the gzip-compressed
	// content begins (equal to FileEnd when compression was applied).
	CompressedStart int
	// CompressedEnd is the byte offset within Data where the gzip-compressed
	// content ends (equal to the total length of Data).
	CompressedEnd int
	// ContentType is the MIME type derived from the file extension.
	ContentType string
	// Date records the time at which the generator ran, embedded in the
	// generated file header and the creation timestamp.
	Date time.Time
}

// buildListFile renders the production static page list template to w using
// data as template input. It returns an error if template execution fails.
func buildListFile(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageList").Parse(staticListTemplate))
	return tpl.Execute(w, data)
}

// buildListFileDev renders the development-mode static page list template to
// w. The resulting file reads assets from disk at runtime instead of embedding
// them as byte literals. It returns an error if template execution fails.
func buildListFileDev(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageList").Parse(staticListTemplateDev))
	return tpl.Execute(w, data)
}

// buildDataFile renders the per-asset Go source template to w using data as
// template input. The output is a single .go file containing one accessor
// function that returns the asset's byte slice and metadata. It returns an
// error if template execution fails.
func buildDataFile(w io.Writer, data interface{}) error {
	tpl := template.Must(template.New(
		"StaticPageData").Parse(staticPageTemplate))
	return tpl.Execute(w, data)
}

// byteToQuotedString converts b into a Go double-quoted string literal
// suitable for embedding verbatim in generated source code.
func byteToQuotedString(b []byte) string {
	return fmt.Sprintf("%q", b)
}

// getMimeTypeByExtension returns the MIME type string for the given file
// extension (including the leading dot). It overrides several common
// extensions that the standard mime package either does not know about or maps
// to incorrect types, falling back to mime.TypeByExtension for everything
// else.
func getMimeTypeByExtension(ext string) string {
	switch ext {
	case ".ico":
		return "image/x-icon"
	case ".md":
		return "text/markdown"
	case ".map":
		return "text/plain"
	case ".txt":
		return "text/plain"
	case ".woff":
		return "application/font-woff"
	case ".woff2":
		return "application/font-woff2"
	default:
		return mime.TypeByExtension(ext)
	}
}

// compressContent gzip-compresses content at the best-compression level and
// appends the result to compressed. It panics if the gzip writer cannot be
// created or if any write fails, as these indicate unrecoverable build-time
// errors.
func compressContent(compressed *bytes.Buffer, content []byte) {
	compressor, compressorBuildErr := gzip.NewWriterLevel(
		compressed, gzip.BestCompression)
	if compressorBuildErr != nil {
		panic(fmt.Sprintln("Cannot build data compressor:", compressorBuildErr))
	}
	defer compressor.Close()
	written := 0
	for len(content) > written {
		wLen, compressErr := compressor.Write(content[written:])
		if compressErr != nil {
			panic(fmt.Sprintln("Cannot write compressed data:", compressErr))
		}
		written += wLen
	}
}

// parseFile reads the file at filePath, determines its MIME type from name's
// extension, optionally gzip-compresses the content (skipping compression for
// images, web fonts, and plain text), and returns a parsedFile populated with
// all metadata required to render the generation templates. id is used to
// produce the numeric suffix of the Go variable name (e.g. id=42 → "STATIC42").
// It panics if the file cannot be read.
func parseFile(
	id int,
	name string,
	filePath string,
	packageName string,
) parsedFile {
	content, readErr := os.ReadFile(filePath)
	if readErr != nil {
		panic(fmt.Sprintln("Cannot read file:", readErr))
	}
	contentLen := len(content)
	fileExtDotIdx := strings.LastIndex(name, ".")
	fileExt := ""
	if fileExtDotIdx >= 0 {
		fileExt = name[fileExtDotIdx:]
	}
	mimeType := getMimeTypeByExtension(fileExt)
	if len(mimeType) <= 0 {
		mimeType = "application/binary"
	}
	if strings.HasPrefix(mimeType, "image/") {
		// Don't compress images
	} else if strings.HasPrefix(mimeType, "application/font-woff") {
		// Don't compress web fonts
	} else if mimeType == "text/plain" {
		// Don't compress plain text
	} else {
		compressed := bytes.NewBuffer(make([]byte, 0, 1024))
		compressContent(compressed, content)
		content = append(content, compressed.Bytes()...)
	}
	goFileName := "Static" + strconv.FormatInt(int64(id), 10)
	return parsedFile{
		Name:            name,
		GOVariableName:  strings.ToTitle(goFileName),
		GOFileName:      strings.ToLower(goFileName) + "_generated.go",
		GOPackage:       packageName,
		Path:            filePath,
		Data:            byteToQuotedString(content),
		FileStart:       0,
		FileEnd:         contentLen,
		CompressedStart: contentLen,
		CompressedEnd:   len(content),
		ContentType:     mimeType,
		Date:            time.Now(),
	}
}

// main is the entry point for the static page generator. It expects exactly
// two positional arguments: the path to the source distribution folder
// containing the compiled front-end assets, and the path to the destination
// list file (static_pages.go). It panics with a usage message on invalid
// arguments or I/O errors.
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
	listFile, listFileErr := os.Create(listFilePath)
	if listFileErr != nil {
		panic(fmt.Sprintf("Unable to open destination list file %s: %s",
			listFilePath, listFileErr))
	}
	defer listFile.Close()
	files, dirOpenErr := os.ReadDir(sourcePath)
	if dirOpenErr != nil {
		panic(fmt.Sprintf("Unable to open dir: %s", dirOpenErr))
	}
	listFile.WriteString(staticListHeader)
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
			if !files[f].Type().IsRegular() {
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
			if !files[f].Type().IsRegular() {
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
			"\nimport \"" + parentPackage + "/" + destFolderPackage + "\"\n")
		tempBuildErr := buildListFile(listFile, parsedFiles)
		if tempBuildErr != nil {
			panic(fmt.Sprintf(
				"Unable to build destination file due to error: %s",
				tempBuildErr))
		}
	}
}
