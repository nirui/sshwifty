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

import assert from "assert";
import * as decoder from "./decoder.js";
import * as encoder from "./encoder.js";

// https://github.com/Snuffy2/sshwifty/issues/205#issuecomment-4072876524
const sample = Uint8Array.from([
  0x90, 0xda, 0x91, 0xb1, 0x82, 0xcc, 0x8f, 0x80, 0x94, 0xf5, 0x82, 0xf0, 0x82,
  0xb5, 0x82, 0xc4, 0x82, 0xa2, 0x82, 0xdc, 0x82, 0xb7, 0x81, 0x42, 0x82, 0xb1,
  0x82, 0xea, 0x82, 0xc9, 0x82, 0xcd, 0x90, 0x94, 0x95, 0xaa, 0x82, 0xa9, 0x82,
  0xa9, 0x82, 0xe9, 0x82, 0xb1, 0x82, 0xc6, 0x82, 0xaa, 0x82, 0xa0, 0x82, 0xe8,
  0x82, 0xdc, 0x82, 0xb7, 0x81, 0x42, 0x0a, 0x8c, 0xc4, 0x8f, 0x6f, 0x92, 0x86,
  0x81, 0x69, 0x8e, 0x63, 0x82, 0xe8, 0x31, 0x30, 0x89, 0xf1, 0x81, 0x6a, 0x81,
  0x45, 0x81, 0x45, 0x81, 0x45, 0x0a,
]);

describe("Iconv", () => {
  it("iconv-lite", async () => {
    const dataCharset = "Shift-JIS";
    let result = new Uint8Array();
    const en = new encoder.IconvEncoder((d) => {
      let m = new Uint8Array(result.length + d.length);
      m.set(result);
      m.set(d, result.length);
      result = m;
    }, dataCharset);
    const de = new decoder.IconvDecoder((d) => en.write(d), dataCharset);
    for (let i in sample) {
      de.write(Uint8Array.from([sample[i].valueOf()]));
    }
    de.close();
    assert.deepStrictEqual(result, sample);
  });
});
