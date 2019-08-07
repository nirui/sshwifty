package static_pages

// This file is part of Sshwifty Project
//
// Copyright (C) 2019 Rui NI (nirui@gmx.com)
//
// https://github.com/niruix/sshwifty
//
// This file is generated at Wed, 07 Aug 2019 15:54:11 CST
// by "go generate", DO NOT EDIT! Also, do not open this file, it maybe too large
// for your editor. You've been warned.
//
// This file may contain third-party binaries. See DEPENDENCES for detail.

import (
	"time"
	"encoding/hex"
)

var rawStatic73Data = `757365722d6167656e743a202a0a0a416c6c6f773a202f240a446973616c6c6f773a202f1f8b08000000000002ff2a2d4e2dd24d4c4fcd2bb152d0e2e272ccc9c92fb752d057e172c92c4e847200000000ffff`

// Static73 returns static file
func Static73() (
	int,        // FileStart
	int,        // FileEnd
	int,        // CompressedStart
	int,        // CompressedEnd
	string,     // ContentHash
	string,     // CompressedHash
	time.Time,  // Time of creation
	[]byte,     // Data
) {
	created, createErr := time.Parse(
		time.RFC1123, "Wed, 07 Aug 2019 15:54:11 CST")

	if createErr != nil {
		panic(createErr)
	}

	data, dataErr := hex.DecodeString(rawStatic73Data)
	
	rawStatic73Data = ""

	if dataErr != nil {
		panic(dataErr)
	}

	return 0, 36, 
		36, 83,
		"UqJ2rT+4q5w=", "Zxyoo2D9bZ0=", created, data
}
