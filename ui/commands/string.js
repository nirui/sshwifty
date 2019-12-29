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

import * as reader from "../stream/reader.js";
import * as integer from "./integer.js";

export class String {
  /**
   * Read String from given reader
   *
   * @param {reader.Reader} rd Source reader
   *
   * @returns {String} readed string
   *
   */
  static async read(rd) {
    let l = new integer.Integer(0);

    await l.unmarshal(rd);

    return new String(await reader.readN(rd, l.value()));
  }

  /**
   * constructor
   *
   * @param {Uint8Array} str String data
   */
  constructor(str) {
    this.str = str;
  }

  /**
   * Return the string
   *
   * @returns {Uint8Array} String data
   *
   */
  data() {
    return this.str;
  }

  /**
   * Return serialized String as array
   *
   * @returns {Uint8Array} serialized String
   *
   */
  buffer() {
    let lBytes = new integer.Integer(this.str.length).marshal(),
      buf = new Uint8Array(lBytes.length + this.str.length);

    buf.set(lBytes, 0);
    buf.set(this.str, lBytes.length);

    return buf;
  }
}
