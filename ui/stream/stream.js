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
import * as header from "./header.js";
import * as reader from "./reader.js";
import * as sender from "./sender.js";
import * as common from "./common.js";

export class Sender {
  /**
   * constructor
   *
   * @param {number} id ID of the stream
   * @param {sender.Sender} sd The data sender
   *
   */
  constructor(id, sd) {
    this.id = id;
    this.sender = sd;
    this.closed = false;
  }

  /**
   * Sends data to remote
   *
   * @param {number} marker binary marker
   * @param {Uint8Array} data data to be sent
   *
   * @throws {Exception} When the sender already been closed
   *
   */
  send(marker, data) {
    if (this.closed) {
      throw new Exception(
        "Sender already been closed. No data can be send",
        false
      );
    }

    let reqHeader = new header.Header(header.STREAM),
      stHeader = new header.Stream(0, 0),
      d = new Uint8Array(data.length + 3);

    reqHeader.set(this.id);
    stHeader.set(marker, data.length);

    d[0] = reqHeader.value();
    d.set(stHeader.buffer(), 1);
    d.set(data, 3);

    return this.sender.send(d);
  }

  /**
   * Sends data to remote, if the data is too long, it will be separated into
   * different stream requests
   *
   * @param {number} marker binary marker
   * @param {Uint8Array} data data to be sent
   *
   * @throws {Exception} When the sender already been closed
   *
   */
  async sendData(marker, data) {
    if (this.closed) {
      throw new Exception(
        "Sender already been closed. No data can be send",
        false
      );
    }

    let dataSeg = common.separateBuffer(data, header.STREAM_MAX_LENGTH),
      reqHeader = new header.Header(header.STREAM);

    reqHeader.set(this.id);

    for (let i in dataSeg) {
      let stHeader = new header.Stream(0, 0),
        d = new Uint8Array(dataSeg[i].length + 3);

      stHeader.set(marker, dataSeg[i].length);

      d[0] = reqHeader.value();
      d.set(stHeader.buffer(), 1);
      d.set(dataSeg[i], 3);

      await this.sender.send(d);
    }
  }

  /**
   * Send stream signals
   *
   * @param {number} signal Signal value
   *
   * @throws {Exception} When the sender already been closed
   *
   */
  signal(signal) {
    if (this.closed) {
      throw new Exception(
        "Sender already been closed. No signal can be send",
        false
      );
    }

    let reqHeader = new header.Header(signal);

    reqHeader.set(this.id);

    return this.sender.send(new Uint8Array([reqHeader.value()]));
  }

  /**
   * Send close signal and close current sender
   *
   */
  close() {
    if (this.closed) {
      return;
    }

    let r = this.signal(header.CLOSE);

    this.closed = true;

    return r;
  }
}

export class InitialSender {
  /**
   * constructor
   *
   * @param {number} id ID of the stream
   * @param {number} commandID ID of the command
   * @param {sender.Sender} sd The data sender
   *
   */
  constructor(id, commandID, sd) {
    this.id = id;
    this.command = commandID;
    this.sender = sd;
  }

  /**
   * Return how large the data can be
   *
   * @returns {number} Max data size
   *
   */
  static maxDataLength() {
    return header.InitialStream.maxDataSize();
  }

  /**
   * Sends data to remote
   *
   * @param {Uint8Array} data data to be sent
   *
   */
  send(data) {
    let reqHeader = new header.Header(header.STREAM),
      stHeader = new header.InitialStream(0, 0),
      d = new Uint8Array(data.length + 3);

    reqHeader.set(this.id);
    stHeader.set(this.command, data.length, true);

    d[0] = reqHeader.value();
    d.set(stHeader.buffer(), 1);
    d.set(data, 3);

    return this.sender.send(d);
  }
}

export class Stream {
  /**
   * constructor
   *
   * @param {number} id ID of the stream
   *
   */
  constructor(id) {
    this.id = id;
    this.command = null;
    this.isInitializing = false;
    this.isShuttingDown = false;
  }

  /**
   * Returns whether or not current stream is running
   *
   * @returns {boolean} True when it's running, false otherwise
   *
   */
  running() {
    return this.command !== null;
  }

  /**
   * Returns whether or not current stream is initializing
   *
   * @returns {boolean} True when it's initializing, false otherwise
   *
   */
  initializing() {
    return this.isInitializing;
  }

  /**
   * Unsets current stream
   *
   */
  clear() {
    this.command = null;
    this.isInitializing = false;
    this.isShuttingDown = false;
  }

  /**
   * Request the stream for a new command
   *
   * @param {number} commandID Command ID
   * @param {function} commandBuilder Function that returns a command
   * @param {sender.Sender} sd Data sender
   *
   * @throws {Exception} when stream already running
   *
   */
  run(commandID, commandBuilder, sd) {
    if (this.running()) {
      throw new Exception(
        "Stream already running, cannot accept new commands",
        false
      );
    }

    this.isInitializing = true;
    this.command = commandBuilder(new Sender(this.id, sd));

    return this.command.run(new InitialSender(this.id, commandID, sd));
  }

  /**
   * Called when initialization respond has been received
   *
   * @param {header.InitialStream} streamInitialHeader Stream Initial header
   *
   * @throws {Exception} When the stream is not running, or been shutting down
   *
   */
  initialize(hd) {
    if (!this.running()) {
      throw new Exception(
        "Cannot initialize a stream that is not running",
        false
      );
    }

    if (this.isShuttingDown) {
      throw new Exception(
        "Cannot initialize a stream that is about to shutdown",
        false
      );
    }

    this.command.initialize(hd);

    if (!hd.success()) {
      this.clear();

      return;
    }

    this.isInitializing = false;
  }

  /**
   * Called when Stream data has been received
   *
   * @param {header.Stream} streamHeader Stream header
   * @param {reader.Limited} rd Data reader
   *
   * @throws {Exception} When the stream is not running, or shutting down
   *
   */
  tick(streamHeader, rd) {
    if (!this.running()) {
      throw new Exception("Cannot tick a stream that is not running", false);
    }

    if (this.isShuttingDown) {
      throw new Exception(
        "Cannot tick a stream that is about to shutdown",
        false
      );
    }

    return this.command.tick(streamHeader, rd);
  }

  /**
   * Called when stream close request has been received
   *
   * @throws {Exception} When the stream is not running, or shutting down
   *
   */
  close() {
    if (!this.running()) {
      throw new Exception("Cannot close a stream that is not running", false);
    }

    if (this.isShuttingDown) {
      throw new Exception(
        "Cannot close a stream that is about to shutdown",
        false
      );
    }

    this.isShuttingDown = true;
    this.command.close();
  }

  /**
   * Called when stream completed respond has been received
   *
   * @throws {Exception} When stream isn't running, or not shutting down
   *
   */
  completed() {
    if (!this.running()) {
      throw new Exception("Cannot close a stream that is not running", false);
    }

    if (!this.isShuttingDown) {
      throw new Exception(
        "Can't complete current stream because Close " +
          "signal is not received",
        false
      );
    }

    this.command.completed();
    this.clear();
  }
}
