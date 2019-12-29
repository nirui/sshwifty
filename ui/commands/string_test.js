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

import * as strings from "./string.js";
import * as reader from "../stream/reader.js";
import assert from "assert";

describe("String", () => {
  it("String 1", async () => {
    let s = new strings.String(new Uint8Array(["H", "E", "L", "L", "O"])),
      sBuf = s.buffer();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    r.feed(sBuf);

    let s2 = await strings.String.read(r);

    assert.deepEqual(s2.data(), s.data());
  });

  it("String 2", async () => {
    let s = new strings.String(
        new Uint8Array([
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D",
          "H",
          "E",
          "L",
          "L",
          "O",
          "W",
          "O",
          "R",
          "L",
          "D"
        ])
      ),
      sBuf = s.buffer();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    r.feed(sBuf);

    let s2 = await strings.String.read(r);

    assert.deepEqual(s2.data(), s.data());
  });
});
