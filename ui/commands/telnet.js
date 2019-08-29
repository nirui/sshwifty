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

import * as address from "./address.js";
import * as command from "./commands.js";
import * as common from "./common.js";
import * as event from "./events.js";
import * as reader from "../stream/reader.js";
import * as stream from "../stream/stream.js";
import * as controls from "./controls.js";
import * as history from "./history.js";
import * as header from "../stream/header.js";
import Exception from "./exception.js";

const COMMAND_ID = 0x00;

const SERVER_INITIAL_ERROR_BAD_ADDRESS = 0x01;

const SERVER_REMOTE_BAND = 0x00;
const SERVER_DIAL_FAILED = 0x01;
const SERVER_DIAL_CONNECTED = 0x02;

const DEFAULT_PORT = 23;

class Telnet {
  /**
   * constructor
   *
   * @param {stream.Sender} sd Stream sender
   * @param {object} config configuration
   * @param {object} callbacks Event callbacks
   *
   */
  constructor(sd, config, callbacks) {
    this.sender = sd;
    this.config = config;
    this.connected = false;
    this.events = new event.Events(
      [
        "initialization.failed",
        "initialized",
        "connect.failed",
        "connect.succeed",
        "@inband",
        "close",
        "@completed"
      ],
      callbacks
    );
  }

  /**
   * Send intial request
   *
   * @param {stream.InitialSender} initialSender Initial stream request sender
   *
   */
  run(initialSender) {
    let addr = new address.Address(
        this.config.host.type,
        this.config.host.address,
        this.config.host.port
      ),
      addrBuf = addr.buffer();

    let data = new Uint8Array(addrBuf.length);

    data.set(addrBuf, 0);

    initialSender.send(data);
  }

  /**
   * Receive the initial stream request
   *
   * @param {header.InitialStream} streamInitialHeader Server respond on the
   *                                                   initial stream request
   *
   */
  initialize(streamInitialHeader) {
    if (!streamInitialHeader.success()) {
      this.events.fire("initialization.failed", streamInitialHeader);

      return;
    }

    this.events.fire("initialized", streamInitialHeader);
  }

  /**
   * Tick the command
   *
   * @param {header.Stream} streamHeader Stream data header
   * @param {reader.Limited} rd Data reader
   *
   * @returns {any} The result of the ticking
   *
   * @throws {Exception} When the stream header type is unknown
   *
   */
  tick(streamHeader, rd) {
    switch (streamHeader.marker()) {
      case SERVER_DIAL_CONNECTED:
        if (!this.connected) {
          this.connected = true;

          return this.events.fire("connect.succeed", rd, this);
        }
        break;

      case SERVER_DIAL_FAILED:
        if (!this.connected) {
          return this.events.fire("connect.failed", rd);
        }
        break;

      case SERVER_REMOTE_BAND:
        if (this.connected) {
          return this.events.fire("inband", rd);
        }
        break;
    }

    throw new Exception("Unknown stream header marker");
  }

  /**
   * Send close signal to remote
   *
   */
  sendClose() {
    return this.sender.close();
  }

  /**
   * Send data to remote
   *
   * @param {Uint8Array} data
   *
   */
  sendData(data) {
    return this.sender.send(0x00, data);
  }

  /**
   * Close the command
   *
   */
  close() {
    this.sendClose();

    return this.events.fire("close");
  }

  /**
   * Tear down the command completely
   *
   */
  completed() {
    return this.events.fire("completed");
  }
}

const initialFieldDef = {
  Host: {
    name: "Host",
    description:
      "Looking for server to connect&quest; Checkout " +
      '<a href="http://www.telnet.org/htm/places.htm" target="blank">' +
      "telnet.org</a> for public servers.",
    type: "text",
    value: "",
    example: "telnet.vaguly.com:23",
    verify(d) {
      if (d.length <= 0) {
        throw new Error("Hostname must be specified");
      }

      let addr = common.splitHostPort(d, DEFAULT_PORT);

      if (addr.addr.length <= 0) {
        throw new Error("Cannot be empty");
      }

      if (addr.addr.length > address.MAX_ADDR_LEN) {
        throw new Error(
          "Can no longer than " + address.MAX_ADDR_LEN + " bytes"
        );
      }

      if (addr.port <= 0) {
        throw new Error("Port must be specified");
      }

      return "Look like " + addr.type + " address";
    }
  }
};

class Wizard {
  /**
   * constructor
   *
   * @param {command.Info} info
   * @param {object} config
   * @param {object} session
   * @param {streams.Streams} streams
   * @param {subscribe.Subscribe} subs
   * @param {controls.Controls} controls
   * @param {history.History} history
   *
   */
  constructor(info, config, session, streams, subs, controls, history) {
    this.info = info;
    this.hasStarted = false;
    this.streams = streams;
    this.config = config;
    this.session = session;
    this.step = subs;
    this.controls = controls;
    this.history = history;

    this.step.resolve(this.stepInitialPrompt());
  }

  started() {
    return this.hasStarted;
  }

  close() {
    this.step.resolve(
      this.stepErrorDone(
        "Action cancelled",
        "Action has been cancelled without reach any success"
      )
    );
  }

  stepErrorDone(title, message) {
    return command.done(false, null, title, message);
  }

  stepSuccessfulDone(data) {
    return command.done(
      true,
      data,
      "Success!",
      "We have connected to the remote"
    );
  }

  stepWaitForAcceptWait() {
    return command.wait(
      "Requesting",
      "Waiting for request to be accepted by the backend"
    );
  }

  stepWaitForEstablishWait(host) {
    return command.wait(
      "Connecting to " + host,
      "Establishing connection with the remote host, may take a while"
    );
  }

  /**
   *
   * @param {stream.Sender} sender
   * @param {object} configInput
   * @param {object} sessionData
   *
   */
  buildCommand(sender, configInput, sessionData) {
    let self = this;

    let parsedConfig = {
      host: address.parseHostPort(configInput.host, DEFAULT_PORT)
    };

    return new Telnet(sender, parsedConfig, {
      "initialization.failed"(streamInitialHeader) {
        switch (streamInitialHeader.data()) {
          case SERVER_INITIAL_ERROR_BAD_ADDRESS:
            self.step.resolve(
              self.stepErrorDone("Request rejected", "Invalid address")
            );

            return;
        }

        self.step.resolve(
          self.stepErrorDone(
            "Request rejected",
            "Unknown error code: " + streamInitialHeader.data()
          )
        );
      },
      initialized(streamInitialHeader) {
        self.step.resolve(self.stepWaitForEstablishWait(configInput.host));
      },
      "connect.succeed"(rd, commandHandler) {
        self.step.resolve(
          self.stepSuccessfulDone(
            new command.Result(
              configInput.host,
              self.info,
              self.controls.get("Telnet", {
                send(data) {
                  return commandHandler.sendData(data);
                },
                close() {
                  return commandHandler.sendClose();
                },
                events: commandHandler.events
              })
            )
          )
        );

        self.history.save(
          self.info.name() + ":" + configInput.host,
          configInput.host,
          new Date(),
          self.info,
          configInput,
          sessionData
        );
      },
      async "connect.failed"(rd) {
        let readed = await reader.readCompletely(rd),
          message = new TextDecoder("utf-8").decode(readed.buffer);

        self.step.resolve(self.stepErrorDone("Connection failed", message));
      },
      "@inband"(rd) {},
      close() {},
      "@completed"() {}
    });
  }

  stepInitialPrompt() {
    let self = this;

    if (this.config) {
      self.hasStarted = true;

      self.streams.request(COMMAND_ID, sd => {
        return self.buildCommand(sd, this.config, this.session);
      });

      return self.stepWaitForAcceptWait();
    }

    return command.prompt(
      "Telnet",
      "Teletype Network",
      "Connect",
      r => {
        self.hasStarted = true;

        self.streams.request(COMMAND_ID, sd => {
          return self.buildCommand(sd, r, this.session);
        });

        self.step.resolve(self.stepWaitForAcceptWait());
      },
      () => {},
      command.fields(initialFieldDef, [{ name: "Host" }])
    );
  }
}

export class Command {
  constructor() {}

  id() {
    return COMMAND_ID;
  }

  name() {
    return "Telnet";
  }

  description() {
    return "Teletype Network";
  }

  color() {
    return "#6ac";
  }

  builder(info, config, session, streams, subs, controls, history) {
    return new Wizard(info, config, session, streams, subs, controls, history);
  }

  launch(info, launcher, streams, subs, controls, history) {
    try {
      initialFieldDef["Host"].verify(launcher);
    } catch (e) {
      throw new Exception(
        'Given launcher "' + launcher + '" was invalid: ' + e
      );
    }

    return this.builder(
      info,
      {
        host: launcher
      },
      null,
      streams,
      subs,
      controls,
      history
    );
  }

  launcher(config) {
    return config.host;
  }
}
