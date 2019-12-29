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

package command

import "fmt"

// Header Packet Type
type Header byte

// Packet Types
const (
	// 00------: Control signals
	// Remaing bits: Data length
	//
	// Format:
	//   0011111 [63 bytes long data] - 63 bytes of control data
	//
	HeaderControl Header = 0x00

	// 01------: Bidirectional stream data
	// Remaining bits: Stream ID
	// Followed by: Parameter or data
	//
	// Format:
	//   0111111 [Command parameters / data] - Open/use stream 63 to execute
	//                                         command or transmit data
	HeaderStream Header = 0x40

	// 10------: Close stream
	// Remaining bits: Stream ID
	//
	// Format:
	//   1011111 - Close stream 63
	//
	// WARNING: The requester MUST NOT send any data to this stream once this
	//          header is sent.
	//
	// WARNING: The receiver MUST reply with a Completed header to indicate
	//          the success of the Close action. Until a Completed header is
	//          replied, all data from the sender must be proccessed as normal.
	HeaderClose Header = 0x80

	// 11------: Stream has been closed/completed in respond to client request
	// Remaining bits: Stream ID
	//
	// Format:
	//   1111111 - Stream 63 is completed
	//
	// WARNING: This header can ONLY be send in respond to a Close header
	//
	// WARNING: The sender of this header MUST NOT send any data to the stream
	//          once this header is sent until this stream been re-opened by a
	//          Data header
	HeaderCompleted Header = 0xc0
)

// Control signal types
const (
	HeaderControlEcho         = 0x00
	HeaderControlPauseStream  = 0x01
	HeaderControlResumeStream = 0x02
)

// Consts
const (
	HeaderMaxData = 0x3f
)

// Cutters
const (
	headerHeaderCutter = 0xc0
	headerDataCutter   = 0x3f
)

// Type get packet type
func (p Header) Type() Header {
	return (p & headerHeaderCutter)
}

// Data returns the data of current Packet header
func (p Header) Data() byte {
	return byte(p & headerDataCutter)
}

// Set set a new value of the Header
func (p *Header) Set(data byte) {
	if data > headerDataCutter {
		panic("data must not be greater than 0x3f")
	}

	*p |= (headerDataCutter & Header(data))
}

// Set set a new value of the Header
func (p Header) String() string {
	switch p.Type() {
	case HeaderControl:
		return fmt.Sprintf("Control (%d bytes)", p.Data())

	case HeaderStream:
		return fmt.Sprintf("Stream (%d)", p.Data())

	case HeaderClose:
		return fmt.Sprintf("Close (Stream %d)", p.Data())

	case HeaderCompleted:
		return fmt.Sprintf("Completed (Stream %d)", p.Data())

	default:
		return "Unknown"
	}
}

// IsStreamControl returns true when the header is for stream control, false
// when otherwise
func (p Header) IsStreamControl() bool {
	switch p {
	case HeaderStream:
		fallthrough
	case HeaderClose:
		fallthrough
	case HeaderCompleted:
		return true

	default:
		return false
	}
}
