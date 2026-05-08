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

/**
 * @file iconv/common.js
 * @description Shared iconv-lite initialisation and charset utilities. Enables
 * the streaming API once (guarded by a flag), exports the supported charset
 * list with UTF-8 as the default first entry, and re-exports the iconv-lite
 * instance as `Iconv` for use by the encoder and decoder modules.
 */

import stream from "stream";
import * as iconv from "iconv-lite";

let iconvInitialized = false;
(() => {
  if (iconvInitialized) {
    return;
  }
  iconv.enableStreamingAPI(stream);
  iconvInitialized = true;
})();

/**
 * Tells if given charset is actually supported by the system
 *
 * @param {string} charset name of the charset
 *
 * @return {bool} true if the charset is supported, false if not
 *
 */
export function charsetSupported(charset) {
  return iconv.encodingExists(charset);
}

const defaultCharset = "UTF-8";

/**
 * List of charset that are recommended by the system. The default charset is
 * always the top element, with another repeated item located at the correct
 * order.
 *
 * Selected from:
 * https://github.com/pillarjs/iconv-lite/wiki/Supported-Encodings
 *
 */
export const charset = [defaultCharset.toLocaleLowerCase()].concat(
  [
    // Unicode
    defaultCharset,
    "UTF-7",
    "UTF-16BE",
    "UTF-16LE",
    "UTF-32BE",
    "UTF-32LE",
    // Multi-byte
    "EUC-JP",
    "Shift-JIS",
    "Windows-31j",
    "Windows-932",
    "GB2312",
    "GBK",
    "GB18030",
    "Windows-936",
    "EUC-CN",
    "KS_C_5601",
    "Windows-949",
    "EUC-KR",
    "Big5",
    "Big5-HKSCS",
    "Windows-950",
    // Single-byte
    "IBM866",
    "ISO-8859-1",
    "ISO-8859-2",
    "ISO-8859-3",
    "ISO-8859-4",
    "ISO-8859-5",
    "ISO-8859-6",
    "ISO-8859-7",
    "ISO-8859-8",
    "ISO-8859-10",
    "ISO-8859-13",
    "ISO-8859-14",
    "ISO-8859-15",
    "ISO-8859-16",
    "Windows-874",
    "Windows-1250",
    "Windows-1251",
    "Windows-1252",
    "Windows-1253",
    "Windows-1254",
    "Windows-1255",
    "Windows-1256",
    "Windows-1257",
    "Windows-1258",
    "macintosh",
    "koi8-r",
    "koi8-u",
    "koi8-ru",
    "koi8-t",
  ]
    .map((v) => v.toLocaleLowerCase())
    .filter((v) => iconv.encodingExists(v))
    .sort(),
);

export { iconv as Iconv };
