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

export class Sender {
  /**
   * constructor
   *
   * @param {function} sender Underlaying sender
   * @param {number} bufferDelay in ms
   *
   */
  constructor(sender, bufferDelay, maxSegSize) {
    this.sender = sender;
    this.delay = bufferDelay;
    this.maxSegSize = maxSegSize;
    this.timeout = null;
    this.buffered = new Uint8Array(this.maxSegSize);
    this.bufferedSize = 0;
    this.subscribe = new subscribe.Subscribe();
    this.sendingPoc = this.sending();
    this.resolves = [];
    this.rejects = [];
  }

  /**
   * Sender proc
   *
   */
  async sending() {
    for (;;) {
      let fetched = await this.subscribe.subscribe();

      await this.sender(fetched);
    }
  }

  /**
   * Clear everything
   *
   */
  async clear() {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.buffered = null;
    this.bufferedSize = 0;

    this.subscribe.reject(new Exception("Sender has been closed", false));

    this.sendingPoc.catch(() => {});

    this.reject(new Exception("Sending has been cancelled", true));
  }

  /**
   * Call resolves
   *
   * @param {any} d Data
   */
  resolve(d) {
    for (let i in this.resolves) {
      this.resolves[i](d);
    }

    this.resolves = [];
    this.rejects = [];
  }

  /**
   * Call rejects
   *
   * @param {any} d Data
   */
  reject(d) {
    for (let i in this.rejects) {
      this.rejects[i](d);
    }

    this.resolves = [];
    this.rejects = [];
  }

  /**
   * Send buffer to the sender
   *
   */
  flushBuffer() {
    if (this.bufferedSize <= 0) {
      return;
    }

    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.resolve(true);

    let d = this.buffered.slice(0, this.bufferedSize);

    this.subscribe.resolve(d);

    if (d.length >= this.buffered.length) {
      this.buffered = new Uint8Array(this.maxSegSize);
      this.bufferedSize = 0;
    } else {
      this.buffered = this.buffered.slice(d.length, this.buffered.length);
      this.bufferedSize = 0;
    }
  }

  /**
   * Append buffer to internal data storage
   *
   * @param {Uint8Array} buf Buffer data
   */
  appendBuffer(buf) {
    let remain = this.buffered.length - this.bufferedSize;

    if (remain <= 0) {
      this.flushBuffer();

      remain = this.buffered.length - this.bufferedSize;
    }

    let start = 0,
      end = remain;

    while (start < buf.length) {
      if (end > buf.length) {
        end = buf.length;
      }

      let d = buf.slice(start, end);

      this.buffered.set(d, this.bufferedSize);
      this.bufferedSize += d.length;

      if (this.buffered.length >= this.bufferedSize) {
        this.flushBuffer();
      }

      start += d.length;
      end = start + (this.buffered.length - this.bufferedSize);
    }
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
    let self = this;

    return new Promise((resolve, reject) => {
      self.resolves.push(resolve);
      self.rejects.push(reject);

      this.appendBuffer(data);

      if (this.bufferedSize <= 0) {
        return;
      }

      self.timeout = setTimeout(() => {
        self.flushBuffer();
      }, self.delay);
    });
  }
}
