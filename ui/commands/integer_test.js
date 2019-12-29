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

import assert from "assert";
import * as reader from "../stream/reader.js";
import * as integer from "./integer.js";

describe("Integer", () => {
  it("Integer 127", async () => {
    let i = new integer.Integer(127),
      marshalled = i.marshal();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    assert.equal(marshalled.length, 1);

    r.feed(marshalled);

    let i2 = new integer.Integer(0);

    await i2.unmarshal(r);

    assert.equal(i.value(), i2.value());
  });

  it("Integer MAX", async () => {
    let i = new integer.Integer(integer.MAX),
      marshalled = i.marshal();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    assert.equal(marshalled.length, 2);

    r.feed(marshalled);

    let i2 = new integer.Integer(0);

    await i2.unmarshal(r);

    assert.equal(i.value(), i2.value());
  });
});
