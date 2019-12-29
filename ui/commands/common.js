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

import * as iconv from "iconv-lite";
import * as buffer from "buffer/";

import Exception from "./exception.js";

const availableEncodings = [
  "utf-8",
  "ibm866",
  "iso-8859-2",
  "iso-8859-3",
  "iso-8859-4",
  "iso-8859-5",
  "iso-8859-6",
  "iso-8859-7",
  "iso-8859-8",
  "iso-8859-10",
  "iso-8859-13",
  "iso-8859-14",
  "iso-8859-15",
  "iso-8859-16",
  "koi8-r",
  "koi8-u",
  "macintosh",
  "windows-874",
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1255",
  "windows-1256",
  "windows-1257",
  "windows-1258",
  "gbk",
  "gb18030",
  "big5",
  "euc-jp",
  "shift-jis",
  "euc-kr",
  "utf-16be",
  "utf-16le"
];

export const charsetPresets = (() => {
  let r = [];

  for (let i in availableEncodings) {
    try {
      if (!iconv.encodingExists(availableEncodings[i])) {
        continue;
      }

      new TextDecoder(availableEncodings[i]);

      r.push(availableEncodings[i]);
    } catch (e) {
      // Do nothing
    }
  }

  return r;
})();

const numCharators = {
  "0": true,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": true,
  "7": true,
  "8": true,
  "9": true
};

const hexCharators = {
  "0": true,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": true,
  "7": true,
  "8": true,
  "9": true,
  a: true,
  b: true,
  c: true,
  d: true,
  e: true,
  f: true
};

const hostnameCharators = {
  "0": true,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": true,
  "7": true,
  "8": true,
  "9": true,
  a: true,
  b: true,
  c: true,
  d: true,
  e: true,
  f: true,
  g: true,
  h: true,
  i: true,
  j: true,
  k: true,
  l: true,
  n: true,
  m: true,
  o: true,
  p: true,
  q: true,
  r: true,
  s: true,
  t: true,
  u: true,
  v: true,
  w: true,
  x: true,
  y: true,
  z: true,
  ".": true,
  "-": true,
  _: true
};

/**
 * Test whether or not given string is all number
 *
 * @param {string} d Input data
 *
 * @returns {boolean} Return true if given string is all number, false otherwise
 *
 */
export function isNumber(d) {
  for (let i = 0; i < d.length; i++) {
    if (!numCharators[d[i]]) {
      return false;
    }
  }

  return true;
}

/**
 * Test whether or not given string is all hex
 *
 * @param {string} d Input data
 *
 * @returns {boolean} Return true if given string is all hex, false otherwise
 *
 */
export function isHex(d) {
  let dd = d.toLowerCase();

  for (let i = 0; i < dd.length; i++) {
    if (!hexCharators[dd[i]]) {
      return false;
    }
  }

  return true;
}

/**
 * Test whether or not given string is all hex
 *
 * @param {string} d Input data
 *
 * @returns {boolean} Return true if given string is all hex, false otherwise
 *
 */
function isHostname(d) {
  let dd = d.toLowerCase();

  for (let i = 0; i < dd.length; i++) {
    if (!hostnameCharators[dd[i]]) {
      return false;
    }
  }

  return true;
}

/**
 * Parse IPv4 address
 *
 * @param {string} d IP address
 *
 * @returns {Uint8Array} Parsed IPv4 Address
 *
 * @throws {Exception} When the given ip address was not an IPv4 addr
 *
 */
export function parseIPv4(d) {
  const addrSeg = 4;

  let s = d.split(".");

  if (s.length != addrSeg) {
    throw new Exception("Invalid address");
  }

  let r = new Uint8Array(addrSeg);

  for (let i in s) {
    if (!isNumber(s[i])) {
      throw new Exception("Invalid address");
    }

    let ii = parseInt(s[i], 10); // Only support dec

    if (isNaN(ii)) {
      throw new Exception("Invalid address");
    }

    if (ii > 0xff) {
      throw new Exception("Invalid address");
    }

    r[i] = ii;
  }

  return r;
}

/**
 * Parse IPv6 address. ::ffff: notation is NOT supported
 *
 * @param {string} d IP address
 *
 * @returns {Uint16Array} Parsed IPv6 Address
 *
 * @throws {Exception} When the given ip address was not an IPv6 addr
 *
 */
export function parseIPv6(d) {
  const addrSeg = 8;

  let s = d.split(":");

  if (s.length > addrSeg || s.length <= 1) {
    throw new Exception("Invalid address");
  }

  if (s[0].charAt(0) === "[") {
    s[0] = s[0].substring(1, s[0].length);

    let end = s.length - 1;

    if (s[end].charAt(s[end].length - 1) !== "]") {
      throw new Exception("Invalid address");
    }

    s[end] = s[end].substring(0, s[end].length - 1);
  }

  let r = new Uint16Array(addrSeg),
    rIndexShift = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i].length <= 0) {
      rIndexShift = addrSeg - s.length;

      continue;
    }

    if (!isHex(s[i])) {
      throw new Exception("Invalid address");
    }

    let ii = parseInt(s[i], 16); // Only support hex

    if (isNaN(ii)) {
      throw new Exception("Invalid address");
    }

    if (ii > 0xffff) {
      throw new Exception("Invalid address");
    }

    r[rIndexShift + i] = ii;
  }

  return r;
}

/**
 * Convert string into a {Uint8Array}
 *
 * @param {string} d Input
 *
 * @returns {Uint8Array} Output
 *
 */
export function strToUint8Array(d) {
  let r = new Uint8Array(d.length);

  for (let i = 0, j = d.length; i < j; i++) {
    r[i] = d.charCodeAt(i);
  }

  return r;
}

/**
 * Convert string into a binary {Uint8Array}
 *
 * @param {string} d Input
 *
 * @returns {Uint8Array} Output
 *
 */
export function strToBinary(d) {
  return new Uint8Array(buffer.Buffer.from(d, "binary").buffer);
}

/**
 * Parse IPv6 address. ::ffff: notation is NOT supported
 *
 * @param {string} d IP address
 *
 * @returns {Uint8Array} Parsed IPv6 Address
 *
 * @throws {Exception} When the given ip address was not an IPv6 addr
 *
 */
export function parseHostname(d) {
  if (d.length <= 0) {
    throw new Exception("Invalid address");
  }

  if (!isHostname(d)) {
    throw new Exception("Invalid address");
  }

  return strToUint8Array(d);
}

function parseIP(d) {
  try {
    return {
      type: "IPv4",
      data: parseIPv4(d)
    };
  } catch (e) {
    // Do nothing
  }

  try {
    return {
      type: "IPv6",
      data: new Uint8Array(parseIPv6(d).buffer)
    };
  } catch (e) {
    // Do nothing
  }

  return {
    type: "Hostname",
    data: parseHostname(d)
  };
}

export function splitHostPort(d, defPort) {
  let hps = d.lastIndexOf(":"),
    fhps = d.indexOf(":"),
    ipv6hps = d.indexOf("[");

  if ((hps < 0 || hps != fhps) && ipv6hps < 0) {
    let a = parseIP(d);

    return {
      type: a.type,
      addr: a.data,
      port: defPort
    };
  }

  if (ipv6hps > 0) {
    throw new Exception("Invalid address");
  } else if (ipv6hps === 0) {
    let ipv6hpse = d.lastIndexOf("]");

    if (ipv6hpse <= ipv6hps || ipv6hpse + 1 != hps) {
      throw new Exception("Invalid address");
    }
  }

  let addr = d.slice(0, hps),
    port = d.slice(hps + 1, d.length);

  if (!isNumber(port)) {
    throw new Exception("Invalid address");
  }

  let portNum = parseInt(port, 10),
    a = parseIP(addr);

  return {
    type: a.type,
    addr: a.data,
    port: portNum
  };
}
