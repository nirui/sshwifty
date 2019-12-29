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
import * as subscribe from "./subscribe.js";

export class Sender {
  /**
   * constructor
   *
   * @param {function} sender Underlaying sender
   * @param {integer} maxSegSize The size of max data segment
   * @param {integer} bufferFlushDelay Buffer flush delay
   * @param {integer} maxBufferedRequests Buffer flush delay
   *
   */
  constructor(sender, maxSegSize, bufferFlushDelay, maxBufferedRequests) {
    this.sender = sender;
    this.maxSegSize = maxSegSize;
    this.subscribe = new subscribe.Subscribe();
    this.sendingPoc = this.sending();
    this.sendDelay = null;
    this.bufferFlushDelay = bufferFlushDelay;
    this.maxBufferedRequests = maxBufferedRequests;
    this.buffer = new Uint8Array(maxSegSize);
    this.bufferUsed = 0;
    this.bufferReq = 0;
  }

  /**
   * Set the send delay of current sender
   *
   * @param {integer} newDelay the new delay
   *
   */
  setDelay(newDelay) {
    this.bufferFlushDelay = newDelay;
  }

  /**
   * Sends data to the this.sender
   *
   * @param {Uint8Array} data to send
   * @param {Array<function>} callbacks to call to return send result
   *
   */
  async sendData(data, callbacks) {
    try {
      await this.sender(data);

      for (let i in callbacks) {
        callbacks[i].resolve();
      }
    } catch (e) {
      for (let i in callbacks) {
        callbacks[i].reject(e);
      }
    }
  }

  /**
   * Append data to the end of internal buffer
   *
   * @param {Uint8Array} data data to add
   *
   * @returns {integer} How many bytes of data is added
   *
   */
  appendBuffer(data) {
    const remainSize = this.buffer.length - this.bufferUsed,
      appendLength = data.length > remainSize ? remainSize : data.length;

    this.buffer.set(data.slice(0, appendLength), this.bufferUsed);
    this.bufferUsed += appendLength;

    return appendLength;
  }

  /**
   * Export current buffer and reset it to empty
   *
   * @returns {Uint8Array} Exported buffer
   *
   */
  exportBuffer() {
    const buffer = this.buffer.slice(0, this.bufferUsed);

    this.bufferUsed = 0;
    this.bufferedRequests = 0;

    return buffer;
  }

  /**
   * Sender proc
   *
   */
  async sending() {
    let callbacks = [];

    for (;;) {
      const fetched = await this.subscribe.subscribe();

      // Force flush?
      if (fetched === true) {
        if (this.bufferUsed <= 0) {
          continue;
        }

        await this.sendData(this.exportBuffer(), callbacks);
        callbacks = [];

        continue;
      }

      callbacks.push({
        resolve: fetched.resolve,
        reject: fetched.reject
      });

      // Add data to buffer and maybe flush when the buffer is full
      let currentSendDataLen = 0;

      while (fetched.data.length > currentSendDataLen) {
        const sentLen = this.appendBuffer(
          fetched.data.slice(currentSendDataLen, fetched.data.length)
        );

        // Buffer not full, wait for the force flush
        if (this.buffer.length > this.bufferUsed) {
          break;
        }

        currentSendDataLen += sentLen;

        await this.sendData(this.exportBuffer(), callbacks);
        callbacks = [];
      }
    }
  }

  /**
   * Clear everything
   *
   */
  close() {
    if (this.sendDelay !== null) {
      clearTimeout(this.sendDelay);
      this.sendDelay = null;
    }

    this.buffered = null;
    this.bufferUsed = 0;
    this.bufferedRequests = 0;

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
    let delayCleared = false;

    if (this.sendDelay !== null) {
      clearTimeout(this.sendDelay);
      this.sendDelay = null;
      delayCleared = true;
    }

    const self = this;

    return new Promise((resolve, reject) => {
      self.subscribe.resolve({
        data: data,
        resolve: resolve,
        reject: reject
      });

      if (self.bufferedRequests >= self.maxBufferedRequests) {
        self.bufferedRequests = 0;

        self.subscribe.resolve(true);

        return;
      }

      if (delayCleared) {
        self.bufferedRequests++;
      }

      self.sendDelay = setTimeout(() => {
        self.sendDelay = null;
        self.bufferedRequests = 0;

        self.subscribe.resolve(true);
      }, self.bufferFlushDelay);
    });
  }
}
