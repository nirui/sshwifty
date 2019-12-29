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
import * as stream from "./stream.js";
import * as reader from "./reader.js";
import * as sender from "./sender.js";
import * as common from "./common.js";

export const ECHO_FAILED = -1;

export class Requested {
  /**
   * constructor
   *
   * @param {stream.Stream} stream The selected stream
   * @param {any} result Result of the run
   *
   */
  constructor(stream, result) {
    this.stream = stream;
    this.result = result;
  }
}

export class Streams {
  /**
   * constructor
   *
   * @param {reader.Reader} reader The data reader
   * @param {sender.Sender} sender The data sender
   * @param {object} config Configuration
   */
  constructor(reader, sender, config) {
    this.reader = reader;
    this.sender = sender;
    this.config = config;
    this.echoTimer = null;
    this.lastEchoTime = null;
    this.lastEchoData = null;
    this.stop = false;

    this.streams = [];

    for (let i = 0; i <= header.HEADER_MAX_DATA; i++) {
      this.streams.push(new stream.Stream(i));
    }
  }

  /**
   * Starts stream proccessing
   *
   * @returns {Promise<true>} When service is completed
   *
   * @throws {Exception} When the process already started
   *
   */
  async serve() {
    if (this.echoTimer !== null) {
      throw new Exception("Already started", false);
    }

    this.echoTimer = setInterval(() => {
      this.sendEcho();
    }, this.config.echoInterval);

    this.stop = false;

    this.sendEcho();

    let ee = null;

    while (!this.stop && ee === null) {
      try {
        await this.tick();
      } catch (e) {
        if (!e.temporary) {
          ee = e;
        }
      }
    }

    this.clear(ee);

    if (ee !== null) {
      throw new Exception("Streams is closed: " + ee, false);
    }
  }

  /**
   * Clear current proccess
   *
   * @param {Exception} e An error caused this clear. Null when no error
   *
   */
  clear(e) {
    if (this.stop) {
      return;
    }

    this.stop = true;

    if (this.echoTimer != null) {
      clearInterval(this.echoTimer);
      this.echoTimer = null;
    }

    for (let i in this.streams) {
      if (!this.streams[i].running()) {
        continue;
      }

      try {
        this.streams[i].close();
      } catch (e) {
        // Do nothing
      }

      try {
        this.streams[i].completed();
      } catch (e) {
        //Do nothing
      }
    }

    try {
      this.sender.close();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }

    try {
      this.reader.close();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }

    this.config.cleared(e);
  }

  /**
   * Request remote to pause stream sending
   *
   */
  pause() {
    let pauseHeader = header.header(header.CONTROL);

    pauseHeader.set(1);

    return this.sender.send(
      new Uint8Array([pauseHeader.value(), header.CONTROL_PAUSESTREAM])
    );
  }

  /**
   * Request remote to resume stream sending
   *
   */
  resume() {
    let pauseHeader = header.header(header.CONTROL);

    pauseHeader.set(1);

    return this.sender.send(
      new Uint8Array([pauseHeader.value(), header.CONTROL_RESUMESTREAM])
    );
  }

  /**
   * Request stream for given command
   *
   * @param {number} commandID Command ID
   * @param {function} commandBuilder Command builder
   *
   * @returns {Requested} The result of the stream command
   *
   */
  request(commandID, commandBuilder) {
    try {
      for (let i in this.streams) {
        if (this.streams[i].running()) {
          continue;
        }

        return new Requested(
          this.streams[i],
          this.streams[i].run(commandID, commandBuilder, this.sender)
        );
      }

      throw new Exception("No stream is currently available", true);
    } catch (e) {
      throw new Exception("Stream request has failed: " + e, true);
    }
  }

  /**
   * Send echo request
   *
   */
  sendEcho() {
    let echoHeader = header.header(header.CONTROL),
      randomNum = new Uint8Array(common.getRands(8, 0, 255));

    echoHeader.set(randomNum.length - 1);

    randomNum[0] = echoHeader.value();
    randomNum[1] = header.CONTROL_ECHO;

    this.sender.send(randomNum).then(() => {
      if (this.lastEchoTime !== null || this.lastEchoData !== null) {
        this.lastEchoTime = null;
        this.lastEchoData = null;

        this.config.echoUpdater(ECHO_FAILED);
      }

      this.lastEchoTime = new Date();
      this.lastEchoData = randomNum.slice(2, randomNum.length);
    });
  }

  /**
   * handle received control request
   *
   * @param {reader.Reader} rd The reader
   *
   */
  async handleControl(rd) {
    let controlType = await reader.readOne(rd),
      delay = 0,
      echoBytes = null;

    switch (controlType[0]) {
      case header.CONTROL_ECHO:
        echoBytes = await reader.readCompletely(rd);

        if (this.lastEchoTime === null || this.lastEchoData === null) {
          return;
        }

        if (this.lastEchoData.length !== echoBytes.length) {
          return;
        }

        for (let i in this.lastEchoData) {
          if (this.lastEchoData[i] == echoBytes[i]) {
            continue;
          }

          this.lastEchoTime = null;
          this.lastEchoData = null;

          this.config.echoUpdater(ECHO_FAILED);

          return;
        }

        delay = new Date().getTime() - this.lastEchoTime.getTime();

        if (delay < 0) {
          delay = 0;
        }

        this.lastEchoTime = null;
        this.lastEchoData = null;

        this.config.echoUpdater(delay);

        return;
    }

    await reader.readCompletely(rd);

    throw new Exception("Unknown control signal: " + controlType);
  }

  /**
   * handle received stream respond
   *
   * @param {header.Header} hd The header
   * @param {reader.Reader} rd The reader
   *
   * @throws {Exception} when given stream is not running
   *
   */
  async handleStream(hd, rd) {
    if (hd.data() >= this.streams.length) {
      return;
    }

    let stream = this.streams[hd.data()];

    if (!stream.running()) {
      // WARNING: Connection must be reset at this point because we cannot
      //          determine how many bytes to read
      throw new Exception(
        'Remote is requesting for stream "' +
          hd.data() +
          '" which is not running',
        false
      );
    }

    let initialHeaderBytes = await reader.readN(rd, 2);

    // WARNING: It's the stream's responsibility to ensure stream data is
    //          completely readed before return
    if (stream.initializing()) {
      let streamHeader = new header.InitialStream(
        initialHeaderBytes[0],
        initialHeaderBytes[1]
      );

      return stream.initialize(streamHeader);
    }

    let streamHeader = new header.Stream(
        initialHeaderBytes[0],
        initialHeaderBytes[1]
      ),
      streamReader = new reader.Limited(rd, streamHeader.length());

    let tickResult = await stream.tick(streamHeader, streamReader);

    await reader.readCompletely(streamReader);

    return tickResult;
  }

  /**
   * handle received close respond
   *
   * @param {header.Header} hd The header
   *
   * @throws {Exception} when given stream is not running
   *
   */
  async handleClose(hd) {
    if (hd.data() >= this.streams.length) {
      return;
    }

    let stream = this.streams[hd.data()];

    if (!stream.running()) {
      // WARNING: Connection must be reset at this point because we cannot
      //          determine how many bytes to read
      throw new Exception(
        'Remote is requesting for stream "' +
          hd.data() +
          '" to be closed, but the stream is not running',
        false
      );
    }

    let cResult = await stream.close();

    let completedHeader = new header.Header(header.COMPLETED);
    completedHeader.set(hd.data());
    this.sender.send(new Uint8Array([completedHeader.value()]));

    return cResult;
  }

  /**
   * handle received close respond
   *
   * @param {header.Header} hd The header
   *
   * @throws {Exception} when given stream is not running
   *
   */
  async handleCompleted(hd) {
    if (hd.data() >= this.streams.length) {
      return;
    }

    let stream = this.streams[hd.data()];

    if (!stream.running()) {
      // WARNING: Connection must be reset at this point because we cannot
      //          determine how many bytes to read
      throw new Exception(
        'Remote is requesting for stream "' +
          hd.data() +
          '" to be completed, but the stream is not running',
        false
      );
    }

    return stream.completed();
  }

  /**
   * Main proccess loop
   *
   * @throws {Exception} when encountered an unknown header
   */
  async tick() {
    let headerBytes = await reader.readOne(this.reader),
      hd = new header.Header(headerBytes[0]);

    switch (hd.type()) {
      case header.CONTROL:
        return this.handleControl(new reader.Limited(this.reader, hd.data()));

      case header.STREAM:
        return this.handleStream(hd, this.reader);

      case header.CLOSE:
        return this.handleClose(hd);

      case header.COMPLETED:
        return this.handleCompleted(hd);

      default:
        throw new Exception("Unknown header", false);
    }
  }
}
