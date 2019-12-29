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
import * as reader from "./reader.js";

describe("Reader", () => {
  it("Buffer", async () => {
    let buf = new reader.Buffer(
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
      () => {}
    );

    let ex = buf.export(1);

    assert.equal(ex.length, 1);
    assert.equal(ex[0], 0);
    assert.equal(buf.remains(), 7);

    ex = await reader.readCompletely(buf);

    assert.equal(ex.length, 7);
    assert.deepEqual(ex, new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
    assert.equal(buf.remains(), 0);
  });

  it("Reader", async () => {
    const maxTests = 3;
    let IntvCount = 0,
      r = new reader.Reader(new reader.Multiple(() => {}), data => {
        return data;
      }),
      expected = [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7
      ],
      feedIntv = setInterval(() => {
        r.feed(Uint8Array.from(expected.slice(0, 8)));

        IntvCount++;

        if (IntvCount < maxTests) {
          return;
        }

        clearInterval(feedIntv);
      }, 300);

    let result = [];

    while (result.length < expected.length) {
      result.push((await r.export(1))[0]);
    }

    assert.deepEqual(result, expected);
  });

  it("readOne", async () => {
    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    setTimeout(() => {
      r.feed(Uint8Array.from([0, 1, 2, 3, 4, 5, 7]));
    }, 100);

    let rr = await reader.readOne(r);

    assert.deepEqual(rr, [0]);

    rr = await reader.readOne(r);

    assert.deepEqual(rr, [1]);
  });

  it("readN", async () => {
    let r = new reader.Reader(new reader.Multiple(() => {}), data => {
      return data;
    });

    setTimeout(() => {
      r.feed(Uint8Array.from([0, 1, 2, 3, 4, 5, 7]));
    }, 100);

    let rr = await reader.readN(r, 3);

    assert.deepEqual(rr, [0, 1, 2]);

    rr = await reader.readN(r, 3);

    assert.deepEqual(rr, [3, 4, 5]);
  });

  it("Limited", async () => {
    const maxTests = 3;
    let IntvCount = 0,
      r = new reader.Reader(new reader.Multiple(() => {}), data => {
        return data;
      }),
      expected = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1],
      limited = new reader.Limited(r, 10),
      feedIntv = setInterval(() => {
        r.feed(Uint8Array.from(expected.slice(0, 8)));

        IntvCount++;

        if (IntvCount < maxTests) {
          return;
        }

        clearInterval(feedIntv);
      }, 300);

    let result = [];

    while (!limited.completed()) {
      result.push((await limited.export(1))[0]);
    }

    assert.equal(limited.completed(), true);
    assert.deepEqual(result, expected);
  });

  it("readCompletely", async () => {
    const maxTests = 3;
    let IntvCount = 0,
      r = new reader.Reader(new reader.Multiple(() => {}), data => {
        return data;
      }),
      expected = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1],
      limited = new reader.Limited(r, 10),
      feedIntv = setInterval(() => {
        r.feed(Uint8Array.from(expected.slice(0, 8)));

        IntvCount++;

        if (IntvCount < maxTests) {
          return;
        }

        clearInterval(feedIntv);
      }, 300);

    let result = await reader.readCompletely(limited);

    assert.equal(limited.completed(), true);
    assert.deepEqual(result, expected);
  });

  it("readUntil", async () => {
    const maxTests = 3;
    let IntvCount = 0,
      r = new reader.Reader(new reader.Multiple(() => {}), data => {
        return data;
      }),
      sample = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1],
      expected1 = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
      expected2 = new Uint8Array([0, 1]),
      limited = new reader.Limited(r, 10),
      feedIntv = setInterval(() => {
        r.feed(Uint8Array.from(sample));

        IntvCount++;

        if (IntvCount < maxTests) {
          return;
        }

        clearInterval(feedIntv);
      }, 300);

    let result = await reader.readUntil(limited, 7);

    assert.equal(limited.completed(), false);
    assert.deepEqual(result.data, expected1);
    assert.deepEqual(result.found, true);

    result = await reader.readUntil(limited, 7);

    assert.equal(limited.completed(), true);
    assert.deepEqual(result.data, expected2);
    assert.deepEqual(result.found, false);
  });
});
