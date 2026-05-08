// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2026 Ni Rui <ranqus@gmail.com>
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

/**
 * @file Single-slot async pub/sub primitive used throughout the stream layer.
 *
 * {@link Subscribe} acts as a rendezvous point: a producer calls
 * {@link Subscribe#resolve} or {@link Subscribe#reject}, and a consumer awaits
 * {@link Subscribe#subscribe}. Pending events are queued when no consumer is
 * waiting.
 */

import Exception from "./exception.js";

/** @private @type {number} Pending-queue entry type for a rejection. */
const typeReject = 0;
/** @private @type {number} Pending-queue entry type for a resolution. */
const typeResolve = 1;

/**
 * Asynchronous single-consumer pub/sub channel.
 *
 * Producers call {@link Subscribe#resolve} or {@link Subscribe#reject} to push
 * values. The consumer calls {@link Subscribe#subscribe} to receive the next
 * value, blocking until one is available. When no more values will be produced,
 * the channel can be shut down with {@link Subscribe#disable}.
 */
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
   * Returns how many resolve/reject events are in the pending queue, including
   * any currently-registered waiter.
   *
   * @returns {number} Count of queued and active pending events.
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
      self.res = (d) => {
        self.res = null;
        self.rej = null;

        resolve(d);
      };

      self.rej = (e) => {
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
