// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2021 NI Rui <ranqus@gmail.com>
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
import * as common from "./common.js";

describe("Common", () => {
  it("parseIPv4", () => {
    let tests = [
      {
        sample: "127.0.0.1",
        expectingFailure: false,
        expected: new Uint8Array([127, 0, 0, 1]),
      },
      {
        sample: "255.255.255.255",
        expectingFailure: false,
        expected: new Uint8Array([255, 255, 255, 255]),
      },
      {
        sample: "255.255.a.255",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "255.255.255",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "a.ssh.vaguly.com",
        expectingFailure: true,
        expected: null,
      },
    ];

    for (let i in tests) {
      if (tests[i].expectingFailure) {
        let ee = null;

        try {
          common.parseIPv4(tests[i].sample);
        } catch (e) {
          ee = e;
        }

        assert.notStrictEqual(ee, null, "Test " + tests[i].sample);
      } else {
        let data = common.parseIPv4(tests[i].sample);

        assert.deepStrictEqual(data, tests[i].expected);
      }
    }
  });

  it("parseIPv6", () => {
    let tests = [
      {
        sample: "2001:db8:1f70:0:999:de8:7648:6e8",
        expectingFailure: false,
        expected: new Uint8Array([
          0x20, 0x01, 0xd, 0xb8, 0x1f, 0x70, 0x0, 0x0, 0x9, 0x99, 0xd, 0xe8,
          0x76, 0x48, 0x6, 0xe8,
        ]),
      },
      {
        sample: "2001:db8:85a3::8a2e:370:7334",
        expectingFailure: false,
        expected: new Uint8Array([
          0x20, 0x01, 0xd, 0xb8, 0x85, 0xa3, 0x0, 0x0, 0x0, 0x0, 0x8a, 0x2e,
          0x3, 0x70, 0x73, 0x34,
        ]),
      },
      {
        sample: "fdef:90fb:4138::8ca",
        expectingFailure: false,
        expected: new Uint8Array([
          0xfd, 0xef, 0x90, 0xfb, 0x41, 0x38, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
          0x0, 0x8, 0xca,
        ]),
      },
      {
        sample: "::1",
        expectingFailure: false,
        expected: new Uint8Array([
          0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
          0x0, 0x1,
        ]),
      },
      {
        sample: "::",
        expectingFailure: false,
        expected: new Uint8Array([
          0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
          0x0, 0x0,
        ]),
      },
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectingFailure: false,
        expected: new Uint8Array([
          0x20, 0x01, 0xd, 0xb8, 0x1f, 0x70, 0x0, 0x0, 0x9, 0x99, 0xd, 0xe8,
          0x76, 0x48, 0x6, 0xe8,
        ]),
      },
      {
        sample: "2001:0db8:ac10:fe01::",
        expectingFailure: false,
        expected: new Uint8Array([
          0x20, 0x01, 0x0d, 0xb8, 0xac, 0x10, 0xfe, 0x01, 0x0, 0x0, 0x0, 0x0,
          0x0, 0x0, 0x0, 0x0,
        ]),
      },
      {
        sample: "::7f00:1",
        expectingFailure: false,
        expected: new Uint8Array([
          0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x7f,
          0x00, 0x00, 0x01,
        ]),
      },
      {
        sample: "127.0.0.1",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "255.255.255.255",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "255.255.a.255",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "255.255.255",
        expectingFailure: true,
        expected: null,
      },
      {
        sample: "a.ssh.vaguly.com",
        expectingFailure: true,
        expected: null,
      },
    ];

    for (let i in tests) {
      if (tests[i].expectingFailure) {
        let ee = null;

        try {
          common.parseIPv6(tests[i].sample);
        } catch (e) {
          ee = e;
        }

        assert.notStrictEqual(ee, null, "Test " + tests[i].sample);
      } else {
        let data = common.parseIPv6(tests[i].sample);

        assert.deepStrictEqual(data, tests[i].expected);
      }
    }
  });

  it("splitHostPort", () => {
    let tests = [
      // Host name
      {
        sample: "ssh.vaguly.com",
        expectedType: "Hostname",
        expectedAddr: common.strToUint8Array("ssh.vaguly.com"),
        expectedPort: 22,
      },
      {
        sample: "ssh.vaguly.com:22",
        expectedType: "Hostname",
        expectedAddr: common.strToUint8Array("ssh.vaguly.com"),
        expectedPort: 22,
      },

      // IPv4
      {
        sample: "10.220.179.110",
        expectedType: "IPv4",
        expectedAddr: new Uint8Array([10, 220, 179, 110]),
        expectedPort: 22,
      },
      {
        sample: "10.220.179.110:3333",
        expectedType: "IPv4",
        expectedAddr: new Uint8Array([10, 220, 179, 110]),
        expectedPort: 3333,
      },

      // IPv6
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectedType: "IPv6",
        expectedAddr: new Uint8Array([
          0x20, 0x01, 0xd, 0xb8, 0x1f, 0x70, 0x0, 0x0, 0x9, 0x99, 0xd, 0xe8,
          0x76, 0x48, 0x6, 0xe8,
        ]),
        expectedPort: 22,
      },
      {
        sample: "[2001:db8:1f70::999:de8:7648:6e8]:100",
        expectedType: "IPv6",
        expectedAddr: new Uint8Array([
          0x20, 0x01, 0xd, 0xb8, 0x1f, 0x70, 0x0, 0x0, 0x9, 0x99, 0xd, 0xe8,
          0x76, 0x48, 0x6, 0xe8,
        ]),
        expectedPort: 100,
      },
    ];

    for (let i in tests) {
      let hostport = common.splitHostPort(tests[i].sample, 22);

      assert.deepStrictEqual(hostport.type, tests[i].expectedType);
      assert.deepStrictEqual(hostport.addr, tests[i].expectedAddr);
      assert.strictEqual(hostport.port, tests[i].expectedPort);
    }
  });
});
