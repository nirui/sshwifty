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

import Exception from "./exception.js";
import * as reader from "../stream/reader.js";
import * as common from "./common.js";

export const LOOPBACK = 0x00;
export const IPV4 = 0x01;
export const IPV6 = 0x02;
export const HOSTNAME = 0x03;

export const MAX_ADDR_LEN = 0x3f;

export class Address {
  /**
   * Read builds an Address from data readed from the reader
   *
   * @param {reader.Reader} rd The reader
   *
   * @returns {Address} The Address
   *
   * @throws {Exception} when address type is invalid
   */
  static async read(rd) {
    let readed = await reader.readN(rd, 3),
      portNum = 0,
      addrType = LOOPBACK,
      addrData = null;

    portNum |= readed[0];
    portNum <<= 8;
    portNum |= readed[1];

    addrType = readed[2] >> 6;

    switch (addrType) {
      case LOOPBACK:
        break;

      case IPV4:
        addrData = await reader.readN(rd, 4);
        break;

      case IPV6:
        addrData = await reader.readN(rd, 16);
        break;

      case HOSTNAME:
        addrData = await reader.readN(rd, 0x3f & readed[2]);
        break;

      default:
        throw new Exception("Unknown address type");
    }

    return new Address(addrType, addrData, portNum);
  }

  /**
   * constructor
   *
   * @param {number} type Type of the address
   * @param {Uint8Array} address Address data
   * @param {number} port port number of the address
   *
   */
  constructor(type, address, port) {
    this.addrType = type;
    this.addrData = address;
    this.addrPort = port;
  }

  /**
   * Return the address type
   *
   */
  type() {
    return this.addrType;
  }

  /**
   * Return the address data
   *
   */
  address() {
    return this.addrData;
  }

  /**
   * Return the port data
   *
   */
  port() {
    return this.addrPort;
  }

  /**
   * Buffer returns the marshalled address
   *
   * @returns {Uint8Array} Marshalled address
   *
   * @throws {Exception} When address data is invalid
   *
   */
  buffer() {
    switch (this.type()) {
      case LOOPBACK:
        return new Uint8Array([
          this.addrPort >> 8,
          this.addrPort & 0xff,
          LOOPBACK << 6
        ]);

      case IPV4:
        if (this.addrData.length != 4) {
          throw new Exception("Invalid address length");
        }

        return new Uint8Array([
          this.addrPort >> 8,
          this.addrPort & 0xff,
          IPV4 << 6,
          this.addrData[0],
          this.addrData[1],
          this.addrData[2],
          this.addrData[3]
        ]);

      case IPV6:
        if (this.addrData.length != 16) {
          throw new Exception("Invalid address length");
        }

        return new Uint8Array([
          this.addrPort >> 8,
          this.addrPort & 0xff,
          IPV6 << 6,
          this.addrData[0],
          this.addrData[1],
          this.addrData[2],
          this.addrData[3],
          this.addrData[4],
          this.addrData[5],
          this.addrData[6],
          this.addrData[7],
          this.addrData[8],
          this.addrData[9],
          this.addrData[10],
          this.addrData[11],
          this.addrData[12],
          this.addrData[13],
          this.addrData[14],
          this.addrData[15]
        ]);

      case HOSTNAME:
        if (this.addrData.length > MAX_ADDR_LEN) {
          throw new Exception("Host name cannot longer than " + MAX_ADDR_LEN);
        }

        let dataBuf = new Uint8Array(this.addrData.length + 3);

        dataBuf[0] = (this.addrPort >> 8) & 0xff;
        dataBuf[1] = this.addrPort & 0xff;
        dataBuf[2] = HOSTNAME << 6;
        dataBuf[2] |= this.addrData.length;

        dataBuf.set(this.addrData, 3);

        return dataBuf;

      default:
        throw new Exception("Unknown address type");
    }
  }
}

/**
 * Get address data
 *
 * @param {string} s Address string
 * @param {number} defaultPort Default port number
 *
 * @returns {object} result
 *
 * @throws {Exception} when the address is invalid
 */
export function parseHostPort(s, defaultPort) {
  let d = common.splitHostPort(s, defaultPort),
    t = HOSTNAME;

  switch (d.type) {
    case "IPv4":
      t = IPV4;
      break;

    case "IPv6":
      t = IPV6;
      break;

    case "Hostname":
      break;

    default:
      throw new Exception("Invalid address type");
  }

  return {
    type: t,
    address: d.addr,
    port: d.port
  };
}
