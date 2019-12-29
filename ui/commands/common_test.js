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
import * as common from "./common.js";

describe("Common", () => {
  it("parseIPv4", () => {
    let tests = [
      {
        sample: "127.0.0.1",
        expectingFailure: false,
        expected: new Uint8Array([127, 0, 0, 1])
      },
      {
        sample: "255.255.255.255",
        expectingFailure: false,
        expected: new Uint8Array([255, 255, 255, 255])
      },
      {
        sample: "255.255.a.255",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "255.255.255",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "a.ssh.vaguly.com",
        expectingFailure: true,
        expected: null
      }
    ];

    for (let i in tests) {
      if (tests[i].expectingFailure) {
        let ee = null;

        try {
          common.parseIPv4(tests[i].sample);
        } catch (e) {
          ee = e;
        }

        assert.notEqual(ee, null, "Test " + tests[i].sample);
      } else {
        let data = common.parseIPv4(tests[i].sample);

        assert.deepEqual(data, tests[i].expected);
      }
    }
  });

  it("parseIPv6", () => {
    let tests = [
      {
        sample: "2001:db8:1f70:0:999:de8:7648:6e8",
        expectingFailure: false,
        expected: new Uint16Array([
          0x2001,
          0xdb8,
          0x1f70,
          0x0,
          0x999,
          0xde8,
          0x7648,
          0x6e8
        ])
      },
      {
        sample: "2001:db8:85a3::8a2e:370:7334",
        expectingFailure: false,
        expected: new Uint16Array([
          0x2001,
          0xdb8,
          0x85a3,
          0x0,
          0x0,
          0x8a2e,
          0x370,
          0x7334
        ])
      },
      {
        sample: "::1",
        expectingFailure: false,
        expected: new Uint16Array([0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x01])
      },
      {
        sample: "::",
        expectingFailure: false,
        expected: new Uint16Array([0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x00])
      },
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectingFailure: false,
        expected: new Uint16Array([
          0x2001,
          0xdb8,
          0x1f70,
          0x0,
          0x999,
          0xde8,
          0x7648,
          0x6e8
        ])
      },
      {
        sample: "2001:0db8:ac10:fe01::",
        expectingFailure: false,
        expected: new Uint16Array([
          0x2001,
          0x0db8,
          0xac10,
          0xfe01,
          0x0,
          0x0,
          0x0,
          0x0
        ])
      },
      {
        sample: "::7f00:1",
        expectingFailure: false,
        expected: new Uint16Array([
          0x0000,
          0x0000,
          0x0000,
          0x0000,
          0x0000,
          0x0000,
          0x7f00,
          0x0001
        ])
      },
      {
        sample: "127.0.0.1",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "255.255.255.255",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "255.255.a.255",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "255.255.255",
        expectingFailure: true,
        expected: null
      },
      {
        sample: "a.ssh.vaguly.com",
        expectingFailure: true,
        expected: null
      }
    ];

    for (let i in tests) {
      if (tests[i].expectingFailure) {
        let ee = null;

        try {
          common.parseIPv6(tests[i].sample);
        } catch (e) {
          ee = e;
        }

        assert.notEqual(ee, null, "Test " + tests[i].sample);
      } else {
        let data = common.parseIPv6(tests[i].sample);

        assert.deepEqual(data, tests[i].expected);
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
        expectedPort: 22
      },
      {
        sample: "ssh.vaguly.com:22",
        expectedType: "Hostname",
        expectedAddr: common.strToUint8Array("ssh.vaguly.com"),
        expectedPort: 22
      },

      // IPv4
      {
        sample: "10.220.179.110",
        expectedType: "IPv4",
        expectedAddr: new Uint8Array([10, 220, 179, 110]),
        expectedPort: 22
      },
      {
        sample: "10.220.179.110:3333",
        expectedType: "IPv4",
        expectedAddr: new Uint8Array([10, 220, 179, 110]),
        expectedPort: 3333
      },

      // IPv6
      {
        sample: "2001:db8:1f70::999:de8:7648:6e8",
        expectedType: "IPv6",
        expectedAddr: new Uint8Array(
          new Uint16Array([
            0x2001,
            0xdb8,
            0x1f70,
            0x0,
            0x999,
            0xde8,
            0x7648,
            0x6e8
          ]).buffer
        ),
        expectedPort: 22
      },
      {
        sample: "[2001:db8:1f70::999:de8:7648:6e8]:100",
        expectedType: "IPv6",
        expectedAddr: new Uint8Array(
          new Uint16Array([
            0x2001,
            0xdb8,
            0x1f70,
            0x0,
            0x999,
            0xde8,
            0x7648,
            0x6e8
          ]).buffer
        ),
        expectedPort: 100
      }
    ];

    for (let i in tests) {
      let hostport = common.splitHostPort(tests[i].sample, 22);

      assert.deepEqual(hostport.type, tests[i].expectedType);
      assert.deepEqual(hostport.addr, tests[i].expectedAddr);
      assert.equal(hostport.port, tests[i].expectedPort);
    }
  });
});
