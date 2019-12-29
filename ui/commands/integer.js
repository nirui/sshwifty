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
import * as reader from "../stream/reader.js";

export const MAX = 0x3fff;
export const MAX_BYTES = 2;

const integerHasNextBit = 0x80;
const integerValueCutter = 0x7f;

export class Integer {
  /**
   * constructor
   *
   * @param {number} num Integer number
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
      this.num & integerValueCutter
    ]);
  }

  /**
   * Parse the reader to build an Integer
   *
   * @param {reader.Reader} rd Data reader
   *
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
