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
import * as address from "./address.js";

describe("Address", () => {
  it("Address Loopback", async () => {
    let addr = new address.Address(address.LOOPBACK, null, 8080),
      buf = addr.buffer();

    let r = new reader.Reader(new reader.Multiple(), data => {
      return data;
    });

    r.feed(buf);

    let addr2 = await address.Address.read(r);

    assert.equal(addr2.type(), addr.type());
    assert.deepEqual(addr2.address(), addr.address());
    assert.equal(addr2.port(), addr.port());
  });

  it("Address IPv4", async () => {
    let addr = new address.Address(
        address.IPV4,
        new Uint8Array([127, 0, 0, 1]),
        8080
      ),
      buf = addr.buffer();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    r.feed(buf);

    let addr2 = await address.Address.read(r);

    assert.equal(addr2.type(), addr.type());
    assert.deepEqual(addr2.address(), addr.address());
    assert.equal(addr2.port(), addr.port());
  });

  it("Address IPv6", async () => {
    let addr = new address.Address(
        address.IPV6,
        new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
        8080
      ),
      buf = addr.buffer();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    r.feed(buf);

    let addr2 = await address.Address.read(r);

    assert.equal(addr2.type(), addr.type());
    assert.deepEqual(addr2.address(), addr.address());
    assert.equal(addr2.port(), addr.port());
  });

  it("Address HostName", async () => {
    let addr = new address.Address(
        address.HOSTNAME,
        new Uint8Array(["v", "a", "g", "u", "l", "1", "2", "3"]),
        8080
      ),
      buf = addr.buffer();

    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    r.feed(buf);

    let addr2 = await address.Address.read(r);

    assert.equal(addr2.type(), addr.type());
    assert.deepEqual(addr2.address(), addr.address());
    assert.equal(addr2.port(), addr.port());
  });
});
