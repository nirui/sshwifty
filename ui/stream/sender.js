// Sshwifty - A Web SSH client
//
// Copyright (C) 2019 Rui NI <nirui@gmx.com>
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
import * as subscribe from "./subscribe.js";
import * as common from "./common.js";

export class Sender {
  /**
   * constructor
   *
   * @param {function} sender Underlaying sender
   *
   */
  constructor(sender, maxSegSize) {
    this.sender = sender;
    this.maxSegSize = maxSegSize;
    this.subscribe = new subscribe.Subscribe();
    this.sendingPoc = this.sending();
  }

  /**
   * Sender proc
   *
   */
  async sending() {
    for (;;) {
      const fetched = await this.subscribe.subscribe();

      try {
        const dataSegs = common.separateBuffer(fetched.data, this.maxSegSize);

        for (let i in dataSegs) {
          await this.sender(dataSegs[i]);
        }

        fetched.resolve();
      } catch (e) {
        fetched.reject(e);
      }
    }
  }

  /**
   * Clear everything
   *
   */
  close() {
    this.buffered = null;
    this.bufferedSize = 0;

    this.subscribe.reject(new Exception("Sender has been cleared", false));
    this.subscribe.disable();

    this.sendingPoc.catch(() => {});
  }

  /**
   * Send data
   *
   * @param {Uint8Array} data data to send
   *
   * @throws {Exception} when sending has been cancelled
   *
   * @returns {Promise} will be resolved when the data is send and will be
   *          rejected when the data is not
   *
   */
  send(data) {
    return new Promise((resolve, reject) => {
      this.subscribe.resolve({
        data: data,
        resolve: resolve,
        reject: reject
      });
    });
  }
}
