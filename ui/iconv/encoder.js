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
//

import * as common from "./common.js";

/**
 * Encode a string that was inputted with specified `charset`, and output the
 * encoded string with `output`
 *
 * @param {function} output a callback to output decoded stream
 * @param {string} charset the charset which the stream is encoded in
 *
 */
export class IconvEncoder {
  constructor(output, charset) {
    this.out = output;
    this.encoder = common.Iconv.encodeStream(charset);
    this.encoder.on("data", (o) => {
      try {
        return output(o);
      } catch (e) {
        // Ignore output error
      }
    });
    return this;
  }

  /**
   * Write encoded string into current encoder
   *
   * @param {Uint8Array} b the encoded stream
   *
   */
  write(b) {
    try {
      return this.encoder.write(b);
    } catch (e) {
      // Ignore encoding error
    }
  }

  /**
   * Closes current encoder
   *
   */
  close() {
    try {
      return this.encoder.end();
    } catch (e) {
      // Ignore encoding error
    }
  }
}
