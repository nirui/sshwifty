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

package commands

import (
	"errors"
	"net"
	"strconv"

	"github.com/niruix/sshwifty/application/rw"
)

//Errors
var (
	ErrAddressParseBufferTooSmallForHeader = errors.New(
		"Buffer space was too small to parse the address header")

	ErrAddressParseBufferTooSmallForIPv4 = errors.New(
		"Buffer space was too small to parse the IPv4 address")

	ErrAddressParseBufferTooSmallForIPv6 = errors.New(
		"Buffer space was too small to parse the IPv6 address")

	ErrAddressParseBufferTooSmallForHostName = errors.New(
		"Buffer space was too small to parse the hostname address")

	ErrAddressMarshalBufferTooSmall = errors.New(
		"Buffer space was too small to marshal the address")

	ErrAddressInvalidAddressType = errors.New(
		"Invalid address type")
)

// AddressType Type of the address
type AddressType byte

// Address types
const (
	LoopbackAddr AddressType = 0x00
	IPv4Addr     AddressType = 0x01
	IPv6Addr     AddressType = 0x02
	HostNameAddr AddressType = 0x03
)

// Address data
type Address struct {
	port uint16
	kind AddressType
	data []byte
}

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
//                         by the remainer of the byte (11-- ----). maxlen = 63
//
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

	addrType := AddressType(buf[2] >> 6)

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
		addrDataLen := int(0x3f & buf[2])

		if len(buf) < addrDataLen {
			return Address{}, ErrAddressParseBufferTooSmallForHostName
		}

		_, rErr := rw.ReadFull(reader, buf[:addrDataLen])

		if rErr != nil {
			return Address{}, rErr
		}

		addrData = buf[:addrDataLen]

	default:
		return Address{}, ErrAddressInvalidAddressType
	}

	return Address{
		port: portNum,
		kind: addrType,
		data: addrData,
	}, nil
}

// NewAddress creates a new Address
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

// Marshal writes address data to the given b
func (a Address) Marshal(b []byte) (int, error) {
	bLen := len(b)

	switch a.Type() {
	case LoopbackAddr:
		if bLen < 3 {
			return 0, ErrAddressMarshalBufferTooSmall
		}

		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(LoopbackAddr << 6)

		return 3, nil

	case IPv4Addr:
		if bLen < 7 {
			return 0, ErrAddressMarshalBufferTooSmall
		}

		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(IPv4Addr << 6)

		copy(b[3:], a.data)

		return 7, nil

	case IPv6Addr:
		if bLen < 19 {
			return 0, ErrAddressMarshalBufferTooSmall
		}

		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(IPv6Addr << 6)

		copy(b[3:], a.data)

		return 19, nil

	case HostNameAddr:
		hLen := len(a.data)

		if hLen > 0x3f {
			panic("Host name cannot longer than 0x3f")
		}

		if bLen < hLen+3 {
			return 0, ErrAddressMarshalBufferTooSmall
		}

		b[0] = byte(a.port >> 8)
		b[1] = byte(a.port)
		b[2] = byte(HostNameAddr << 6)
		b[2] |= byte(hLen)

		copy(b[3:], a.data)

		return hLen + 3, nil

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
