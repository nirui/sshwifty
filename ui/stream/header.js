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

import Exception from "./exception.js";

export const CONTROL = 0x00;
export const STREAM = 0x40;
export const CLOSE = 0x80;
export const COMPLETED = 0xc0;

export const CONTROL_ECHO = 0x00;
export const CONTROL_PAUSESTREAM = 0x01;
export const CONTROL_RESUMESTREAM = 0x02;

const headerHeaderCutter = 0xc0;
const headerDataCutter = 0x3f;

export const HEADER_MAX_DATA = headerDataCutter;

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

export const STREAM_HEADER_BYTE_LENGTH = 2;
export const STREAM_MAX_LENGTH = 0x1fff;
export const STREAM_MAX_MARKER = 0x07;

const streamHeaderLengthFirstByteCutter = 0x1f;

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
