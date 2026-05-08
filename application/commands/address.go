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

// Package commands – address.go defines the Address wire type used by SSH and
// Telnet commands to represent a remote endpoint. It handles four address
// families (loopback, IPv4, IPv6, hostname) and provides serialisation and
// deserialisation against the binary wire format.
package commands

import (
	"errors"
	"net"
	"regexp"
	"strconv"

	"github.com/Snuffy2/sshwifty/application/rw"
)

// Errors
var (
	ErrAddressParseBufferTooSmallForHeader = errors.New(
		"buffer space was too small to parse the address header")

	ErrAddressParseBufferTooSmallForIPv4 = errors.New(
		"buffer space was too small to parse the IPv4 address")

	ErrAddressParseBufferTooSmallForIPv6 = errors.New(
		"buffer space was too small to parse the IPv6 address")

	ErrAddressParseBufferTooSmallForHostName = errors.New(
		"buffer space was too small to parse the hostname address")

	ErrAddressMarshalBufferTooSmall = errors.New(
		"buffer space was too small to marshal the address")

	ErrAddressInvalidAddressType = errors.New(
		"invalid address type")

	ErrAddressInvalidHostAddress = errors.New(
		"invalid host address")
)

// AddressType identifies which of the four supported address families an
// Address uses on the wire.
type AddressType byte

// LoopbackAddr, IPv4Addr, IPv6Addr, and HostNameAddr are the four wire-level
// address type codes carried in the address header byte.
const (
	LoopbackAddr AddressType = 0x00
	IPv4Addr     AddressType = 0x01
	IPv6Addr     AddressType = 0x02
	HostNameAddr AddressType = 0x03
)

// MaxHostNameLen is the maximum number of bytes a hostname address may contain.
const (
	MaxHostNameLen = 255
)

// Address represents a parsed remote endpoint consisting of a TCP port number,
// an address family, and the raw address bytes. Use ParseAddress or NewAddress
// to construct one.
type Address struct {
	// port is the TCP port number for the remote endpoint.
	port uint16
	// kind identifies the address family.
	kind AddressType
	// data holds the address bytes (4 for IPv4, 16 for IPv6, n for hostname).
	data []byte
}

// hostNameVerifier is the compiled regular expression used to validate hostname
// address data. Only alphanumeric characters, dots, underscores, and hyphens
// are permitted.
var (
	hostNameVerifier = regexp.MustCompile("^([0-9A-Za-z_.\\-]+)$")
)

// ParseAddress parses the reader and return an Address
//
// Address data format:
// +-------------+--------------+---------------+
// | 2 bytes     | 1 byte       | n bytes       |
// +-------------+--------------+---------------+
// | Port number | Address type | Address data  |
// +-------------+--------------+---------------+
//
// Address types:
//   - LoopbackAddr:    00 Localhost, don't carry Address data
//   - IPv4Addr:        01 IPv4 Address, carries 4 bytes of Address data
//   - IPv6Addr:        10 IPv6 Address, carries 16 bytes Address data
//   - HostnameAddr:    11 Host name string, length of Address data is indicated
//     by the remainer of the byte (11-- ----). maxlen = 63
func ParseAddress(reader rw.ReaderFunc, buf []byte) (Address, error) {
	if len(buf) < 3 {
		return Address{}, ErrAddressParseBufferTooSmallForHeader
	}

	_, rErr := rw.ReadFull(reader, buf[:3])
	if rErr != nil {
		return Address{}, rErr
	}

	portNum := uint16(0)
	portNum |= uint16(buf[0])
	portNum <<= 8
	portNum |= uint16(buf[1])

	addrType := AddressType(buf[2])

	var addrData []byte

	switch addrType {
	case LoopbackAddr:
		// Do nothing
	case IPv4Addr:
		if len(buf) < 4 {
			return Address{}, ErrAddressParseBufferTooSmallForIPv4
		}

		_, rErr := rw.ReadFull(reader, buf[:4])
		if rErr != nil {
			return Address{}, rErr
		}
		addrData = buf[:4]

	case IPv6Addr:
		if len(buf) < 16 {
			return Address{}, ErrAddressParseBufferTooSmallForIPv6
		}
		_, rErr := rw.ReadFull(reader, buf[:16])
		if rErr != nil {
			return Address{}, rErr
		}
		addrData = buf[:16]

	case HostNameAddr:
		addrLen := [1]byte{}
		_, rErr := rw.ReadFull(reader, addrLen[:])
		if rErr != nil {
			return Address{}, rErr
		}
		addrDataLen := int(addrLen[0])
		if len(buf) < addrDataLen {
			return Address{}, ErrAddressParseBufferTooSmallForHostName
		}

		_, rErr = rw.ReadFull(reader, buf[:addrDataLen])
		if rErr != nil {
			return Address{}, rErr
		}
		addrData = hostNameVerifier.Find(buf[:addrDataLen])
		if len(addrData) <= 0 {
			return Address{}, ErrAddressInvalidHostAddress
		}

	default:
		return Address{}, ErrAddressInvalidAddressType
	}

	return Address{
		port: portNum,
		kind: addrType,
		data: addrData,
	}, nil
}

// NewAddress constructs an Address directly from its components without
// reading from the wire. data must match the size expected for addrType.
func NewAddress(addrType AddressType, data []byte, port uint16) Address {
	return Address{
		port: port,
		kind: addrType,
		data: data,
	}
}

// Type returns the type of the address
func (a Address) Type() AddressType {
	return a.kind
}

// Data returns the address data
func (a Address) Data() []byte {
	return a.data
}

// Port returns port number
func (a Address) Port() uint16 {
	return a.port
}

// Marshal serialises the Address into b using the wire format described in
// ParseAddress. It returns the number of bytes written or an error if b is too
// small to hold the encoded form.
func (a Address) Marshal(b []byte) (int, error) {
	bLen := len(b)

	switch a.Type() {
	case LoopbackAddr:
		if bLen < 3 {
			return 0, ErrAddressMarshalBufferTooSmall
		}
		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(LoopbackAddr)
		return 3, nil

	case IPv4Addr:
		if bLen < 7 {
			return 0, ErrAddressMarshalBufferTooSmall
		}
		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(IPv4Addr)
		copy(b[3:], a.data)
		return 7, nil

	case IPv6Addr:
		if bLen < 19 {
			return 0, ErrAddressMarshalBufferTooSmall
		}
		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(IPv6Addr)
		copy(b[3:], a.data)
		return 19, nil

	case HostNameAddr:
		hLen := len(a.data)
		if hLen > MaxHostNameLen {
			panic("Host name cannot longer than 0x3f")
		}
		if bLen < hLen+4 {
			return 0, ErrAddressMarshalBufferTooSmall
		}
		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(HostNameAddr)
		b[3] = byte(hLen)
		copy(b[4:], a.data)
		return hLen + 4, nil

	default:
		return 0, ErrAddressInvalidAddressType
	}
}

// String return the Address as string
func (a Address) String() string {
	switch a.Type() {
	case LoopbackAddr:
		return net.JoinHostPort(
			"localhost",
			strconv.FormatUint(uint64(a.Port()), 10))

	case IPv4Addr:
		return net.JoinHostPort(
			net.IPv4(a.data[0], a.data[1], a.data[2], a.data[3]).String(),
			strconv.FormatUint(uint64(a.Port()), 10))

	case IPv6Addr:
		return net.JoinHostPort(
			net.IP(a.data[:net.IPv6len]).String(),
			strconv.FormatUint(uint64(a.Port()), 10))

	case HostNameAddr:
		return net.JoinHostPort(
			string(a.data),
			strconv.FormatUint(uint64(a.Port()), 10))

	default:
		panic("Unknown Address type")
	}
}
