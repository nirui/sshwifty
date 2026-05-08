// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2026 Ni Rui <ranqus@gmail.com>
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

/**
 * @file Binary protocol header definitions for the Sshwifty stream layer.
 *
 * Provides constants for header types (CONTROL, STREAM, CLOSE, COMPLETED) and
 * the {@link Header}, {@link Stream}, and {@link InitialStream} classes that
 * encode and decode the single- and two-byte framing headers used on the wire.
 */

import Exception from "./exception.js";

/** @type {number} Header type byte for control frames. */
/** @type {number} Header type byte for control frames. */
export const CONTROL = 0x00;
/** @type {number} Header type byte for stream data frames. */
export const STREAM = 0x40;
/** @type {number} Header type byte for stream-close frames. */
export const CLOSE = 0x80;
/** @type {number} Header type byte for stream-completed acknowledgement frames. */
export const COMPLETED = 0xc0;

/** @type {number} Control sub-type: echo/ping request. */
export const CONTROL_ECHO = 0x00;
/** @type {number} Control sub-type: ask remote to pause stream sending. */
export const CONTROL_PAUSESTREAM = 0x01;
/** @type {number} Control sub-type: ask remote to resume stream sending. */
export const CONTROL_RESUMESTREAM = 0x02;

/** @private @type {number} Bitmask that isolates the two type bits of a header byte. */
const headerHeaderCutter = 0xc0;
/** @private @type {number} Bitmask that isolates the six data bits of a header byte. */
const headerDataCutter = 0x3f;

/** @type {number} Maximum value that can be stored in a single-byte header's data field. */
export const HEADER_MAX_DATA = headerDataCutter;

/**
 * Single-byte control/close/completed frame header.
 *
 * The byte is split into two fields:
 * - bits 7-6: frame type (CONTROL / STREAM / CLOSE / COMPLETED)
 * - bits 5-0: data payload (stream ID or control sub-type length)
 */
export class Header {
  /**
   * constructor
   *
   * @param {number} headerByte one byte data of the header
   */
  constructor(headerByte) {
    this.headerByte = headerByte;
  }

  /**
   * Return the header type
   *
   * @returns {number} Type number
   *
   */
  type() {
    return this.headerByte & headerHeaderCutter;
  }

  /**
   * Return the header data
   *
   * @returns {number} Data number
   *
   */
  data() {
    return this.headerByte & headerDataCutter;
  }

  /**
   * Set the reader data
   *
   * @param {number} data
   */
  set(data) {
    if (data > headerDataCutter) {
      throw new Exception("data must not be greater than 0x3f", false);
    }

    this.headerByte |= headerDataCutter & data;
  }

  /**
   * Return the header value
   *
   * @returns {number} Header byte data
   *
   */
  value() {
    return this.headerByte;
  }
}

/** @type {number} Byte length of a stream sub-header (marker + length). */
export const STREAM_HEADER_BYTE_LENGTH = 2;
/** @type {number} Maximum payload length encoded in one stream sub-header. */
export const STREAM_MAX_LENGTH = 0x1fff;
/** @type {number} Maximum marker value (3 bits). */
export const STREAM_MAX_MARKER = 0x07;

/** @private @type {number} Bitmask for the lower 5 bits of the first stream header byte (length MSBs). */
const streamHeaderLengthFirstByteCutter = 0x1f;

/**
 * Two-byte stream data sub-header that follows a STREAM-type frame header.
 *
 * Layout of the two bytes:
 * - byte 1 bits 7-5: marker (3-bit application-level signal)
 * - byte 1 bits 4-0 + byte 2: 13-bit payload length (big-endian)
 */
export class Stream {
  /**
   * constructor
   *
   * @param {number} headerByte1 First header byte
   * @param {number} headerByte2 Second header byte
   *
   */
  constructor(headerByte1, headerByte2) {
    this.headerByte1 = headerByte1;
    this.headerByte2 = headerByte2;
  }

  /**
   * Return the marker data
   *
   * @returns {number} the marker
   *
   */
  marker() {
    return this.headerByte1 >> 5;
  }

  /**
   * Return the stream data length
   *
   * @returns {number} Length of the stream data
   *
   */
  length() {
    let r = 0;

    r |= this.headerByte1 & streamHeaderLengthFirstByteCutter;
    r <<= 8;
    r |= this.headerByte2;

    return r;
  }

  /**
   * Set the header
   *
   * @param {number} marker Header marker
   * @param {number} length Stream data length
   *
   */
  set(marker, length) {
    if (marker > STREAM_MAX_MARKER) {
      throw new Exception("marker must not be greater than 0x07", false);
    }

    if (length > STREAM_MAX_LENGTH) {
      throw new Exception("n must not be greater than 0x1fff", false);
    }

    this.headerByte1 =
      (marker << 5) | ((length >> 8) & streamHeaderLengthFirstByteCutter);
    this.headerByte2 = length & 0xff;
  }

  /**
   * Return the header data
   *
   * @returns {Uint8Array} Header data
   *
   */
  buffer() {
    return new Uint8Array([this.headerByte1, this.headerByte2]);
  }
}

/**
 * Two-byte sub-header for the initial stream request / response frame.
 *
 * Encodes the command ID (4 bits), a success flag (1 bit), and a data field
 * (11 bits) into the same two-byte space used by {@link Stream}.
 *
 * @extends Stream
 */
export class InitialStream extends Stream {
  /**
   * Return how large the data can be
   *
   * @returns {number} Max data size
   *
   */
  static maxDataSize() {
    return 0x07ff;
  }

  /**
   * constructor
   *
   * @param {number} headerByte1 First header byte
   * @param {number} headerByte2 Second header byte
   *
   */
  constructor(headerByte1, headerByte2) {
    super(headerByte1, headerByte2);
  }

  /**
   * Return command ID
   *
   * @returns {number} Command ID
   *
   */
  command() {
    return this.headerByte1 >> 4;
  }

  /**
   * Return data
   *
   * @returns {number} Data
   *
   */
  data() {
    let r = 0;

    r |= this.headerByte1 & 0x07;
    r <<= 8;
    r |= this.headerByte2 & 0xff;

    return r;
  }

  /**
   * Return whether or not the respond is success
   *
   * @returns {boolean} True when the request is successful, false otherwise
   *
   */
  success() {
    return (this.headerByte1 & 0x08) != 0;
  }

  /**
   * Set the header
   *
   * @param {number} commandID Command ID
   * @param {number} data Stream data
   * @param {boolean} success Whether or not the request is successful
   *
   */
  set(commandID, data, success) {
    if (commandID > 0x0f) {
      throw new Exception("Command ID must not greater than 0x0f", false);
    }

    if (data > InitialStream.maxDataSize()) {
      throw new Exception("Data must not greater than 0x07ff", false);
    }

    let dd = data & InitialStream.maxDataSize();

    if (success) {
      dd |= 0x0800;
    }

    this.headerByte1 = 0;
    this.headerByte1 |= commandID << 4;
    this.headerByte1 |= dd >> 8;
    this.headerByte2 = 0;
    this.headerByte2 |= dd & 0xff;
  }
}

/**
 * Build a new Header
 *
 * @param {number} h Header number
 *
 * @returns {Header} The header which been built
 *
 */
export function header(h) {
  return new Header(h);
}
