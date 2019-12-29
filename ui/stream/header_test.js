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

import * as header from "./header.js";
import assert from "assert";

describe("Header", () => {
  it("Header", () => {
    let h = new header.Header(header.ECHO);

    h.set(63);

    let n = new header.Header(h.value());

    assert.equal(h.type(), n.type());
    assert.equal(h.data(), n.data());
    assert.equal(n.type(), header.CONTROL);
    assert.equal(n.data(), 63);
  });

  it("Stream", () => {
    let h = new header.Stream(0, 0);

    h.set(header.STREAM_MAX_MARKER, header.STREAM_MAX_LENGTH);

    assert.equal(h.marker(), header.STREAM_MAX_MARKER);
    assert.equal(h.length(), header.STREAM_MAX_LENGTH);

    assert.equal(h.headerByte1, 0xff);
    assert.equal(h.headerByte2, 0xff);
  });

  it("InitialStream", () => {
    let h = new header.InitialStream(0, 0);

    h.set(15, 128, true);

    assert.equal(h.command(), 15);
    assert.equal(h.data(), 128);
    assert.equal(h.success(), true);
  });
});
