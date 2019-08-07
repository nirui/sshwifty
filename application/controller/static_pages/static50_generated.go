package static_pages

// This file is part of Sshwifty Project
//
// Copyright (C) 2019 Rui NI (nirui@gmx.com)
//
// https://github.com/niruix/sshwifty
//
// This file is generated at Wed, 07 Aug 2019 15:54:10 CST
// by "go generate", DO NOT EDIT! Also, do not open this file, it maybe too large
// for your editor. You've been warned.
//
// This file may contain third-party binaries. See DEPENDENCES for detail.

import (
	"time"
	"encoding/hex"
)

var rawStatic50Data = `7b2276657273696f6e223a332c22736f7572636573223a5b5d2c226e616d6573223a5b5d2c226d617070696e6773223a22222c2266696c65223a223732333762303734343439313032343039376433642e637373222c22736f75726365526f6f74223a22227d1f8b08000000000002ffaa562a4b2d2acecccf53b232d6512ace2f2d4a4e2d56b28a8ed551ca4bcc853173130b0a32f3d28b95ac94947494d232735295ac94cc8d8ccd930ccc4d4c4c2c0d0d8c4c0c2ccd538c53f4928b8b95600605e5e79780b4d402000000ffff`

// Static50 returns static file
func Static50() (
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
		time.RFC1123, "Wed, 07 Aug 2019 15:54:10 CST")

	if createErr != nil {
		panic(createErr)
	}

	data, dataErr := hex.DecodeString(rawStatic50Data)
	
	rawStatic50Data = ""

	if dataErr != nil {
		panic(dataErr)
	}

	return 0, 102, 
		102, 206,
		"Pax14oQxroQ=", "aCysfJVxov4=", created, data
}
