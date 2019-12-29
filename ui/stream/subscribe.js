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

const typeReject = 0;
const typeResolve = 1;

export class Subscribe {
  /**
   * constructor
   *
   */
  constructor() {
    this.res = null;
    this.rej = null;
    this.pending = [];
    this.disabled = null;
  }

  /**
   * Returns how many resolve/reject in the pending
   */
  pendings() {
    return (
      this.pending.length + (this.rej !== null || this.res !== null ? 1 : 0)
    );
  }

  /**
   * Resolve the subscribe waiter
   *
   * @param {any} d Resolve data which will be send to the subscriber
   */
  resolve(d) {
    if (this.res !== null) {
      this.res(d);

      return;
    }

    this.pending.push([typeResolve, d]);
  }

  /**
   * Reject the subscribe waiter
   *
   * @param {any} e Error message that will be send to the subscriber
   *
   */
  reject(e) {
    if (this.rej !== null) {
      this.rej(e);

      return;
    }

    this.pending.push([typeReject, e]);
  }

  /**
   * Waiting and receive subscribe data
   *
   * @returns {Promise<any>} Data receiver
   *
   */
  subscribe() {
    if (this.pending.length > 0) {
      let p = this.pending.shift();

      switch (p[0]) {
        case typeReject:
          throw p[1];

        case typeResolve:
          return p[1];

        default:
          throw new Exception("Unknown pending type", false);
      }
    }

    if (this.disabled) {
      throw new Exception(this.disabled, false);
    }

    let self = this;

    return new Promise((resolve, reject) => {
      self.res = d => {
        self.res = null;
        self.rej = null;

        resolve(d);
      };

      self.rej = e => {
        self.res = null;
        self.rej = null;

        reject(e);
      };
    });
  }

  /**
   * Disable current subscriber when all internal data is readed
   *
   * @param {string} reason Reason of the disable
   *
   */
  disable(reason) {
    this.disabled = reason;
  }
}
