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
 * @file Variable-length integer encoding used by the Sshwifty command protocol.
 *
 * Encodes integers up to {@link MAX} (0x3FFF) into 1 or 2 bytes using a
 * continuation-bit scheme: if bit 7 of the first byte is set, a second byte
 * follows. {@link Integer} provides both {@link Integer#marshal} (encode) and
 * {@link Integer#unmarshal} (decode from a reader) operations.
 */

import * as reader from "../stream/reader.js";
import Exception from "./exception.js";

export const MAX = 0x3fff;
export const MAX_BYTES = 2;

const integerHasNextBit = 0x80;
const integerValueCutter = 0x7f;

/**
 * Variable-length encoded integer for the command protocol.
 *
 * Values ≤ 0x7F are stored in one byte; values up to {@link MAX} (0x3FFF) use
 * two bytes with a continuation bit. Use {@link Integer#marshal} to encode and
 * {@link Integer#unmarshal} to decode from a stream reader.
 */
export class Integer {
  /**
   * constructor
   *
   * @param {number} num Initial integer value (used as the starting accumulator
   *   for unmarshal; pass `0` when decoding).
   *
   */
  constructor(num) {
    this.num = num;
  }

  /**
   * Marshal integer to buffer
   *
   * @returns {Uint8Array} Integer buffer
   *
   * @throws {Exception} When number is too large
   *
   */
  marshal() {
    if (this.num > MAX) {
      throw new Exception("Integer number cannot be greater than 0x3fff");
    }

    if (this.num <= integerValueCutter) {
      return new Uint8Array([this.num & integerValueCutter]);
    }

    return new Uint8Array([
      (this.num >> 7) | integerHasNextBit,
      this.num & integerValueCutter,
    ]);
  }

  /**
   * Decode an integer from the reader in-place, accumulating into `this.num`.
   *
   * Reads up to {@link MAX_BYTES} bytes. Stops when a byte with the
   * continuation bit clear is encountered.
   *
   * @param {reader.Reader} rd Data reader to consume bytes from.
   * @returns {Promise<void>} Resolves when decoding is complete.
   */
  async unmarshal(rd) {
    for (let i = 0; i < MAX_BYTES; i++) {
      let r = await reader.readOne(rd);

      this.num |= r[0] & integerValueCutter;

      if ((integerHasNextBit & r[0]) == 0) {
        return;
      }

      this.num <<= 7;
    }
  }

  /**
   * Return the value of the number
   *
   * @returns {number} The integer value
   *
   */
  value() {
    return this.num;
  }
}
