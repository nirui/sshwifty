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

var rawStatic48Data = `7b0a20202276657273696f6e223a2022312e30222c0a2020226e616d65223a202253737769667479222c0a2020226465736372697074696f6e223a206e756c6c2c0a20202269636f6e73223a207b0a20202020223630223a202266697265666f785f6170705f36307836302e706e67222c0a2020202022313238223a202266697265666f785f6170705f313238783132382e706e67222c0a2020202022353132223a202266697265666f785f6170705f353132783531322e706e67220a20207d2c0a202022646576656c6f706572223a207b0a20202020226e616d65223a206e756c6c2c0a202020202275726c223a206e756c6c0a20207d0a7d1f8b08000000000002ff5c8e410a83301444f79e62f8eb22f90145bc460f20626309a44948d4a614ef5ea29616b78f37c37b17002d2a44ed2cb5202e055d32b3fd4365708d4f3d4eaf1dde541c82f6d32edbd9980debc1d9482df21940b5c8c3510735bad4f5de77b548b528bdbd6f3700b16cce0ecb26b16cfead8ae5d9aa58a68ae56615c07a642dca38afc2afe1c8ff260234077380bc2bd60f000000ffff`

// Static48 returns static file
func Static48() (
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

	data, dataErr := hex.DecodeString(rawStatic48Data)
	
	rawStatic48Data = ""

	if dataErr != nil {
		panic(dataErr)
	}

	return 0, 250, 
		250, 410,
		"1dt/vqnONiQ=", "S7HxwGVBXUY=", created, data
}
