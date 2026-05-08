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
 * @file Telnet command implementation for the Sshwifty UI.
 *
 * Exposes {@link Command} — the public entry point registered with the command
 * registry — and the private {@link Telnet}, {@link Wizard}, and
 * {@link Executor} classes that handle the full Telnet connection lifecycle:
 * initial address handshake, hook-output display, connection, and live in-band
 * data I/O.
 */

import * as reader from "../stream/reader.js";
import * as address from "./address.js";
import * as command from "./commands.js";
import * as common from "./common.js";
import * as event from "./events.js";
import Exception from "./exception.js";
import * as presets from "./presets.js";
import * as strings from "./string.js";

const COMMAND_ID = 0x00;

const SERVER_INITIAL_ERROR_BAD_ADDRESS = 0x01;

const SERVER_REMOTE_BAND = 0x00;
const SERVER_HOOK_OUTPUT_BEFORE_CONNECTING = 0x01;
const SERVER_DIAL_FAILED = 0x02;
const SERVER_DIAL_CONNECTED = 0x03;

const DEFAULT_PORT = 23;

const HostMaxSearchResults = 3;

/**
 * Telnet command handler for a single active stream.
 *
 * Manages Telnet lifecycle events (connected, failed, in-band data) by
 * dispatching them through an {@link Events} instance. Exposes methods for
 * sending data and close signals.
 *
 * @private
 */
class Telnet {
  /**
   * constructor
   *
   * @param {stream.Sender} sd Stream sender used to write to the remote.
   * @param {object} config Parsed connection config (host address, charset).
   * @param {object} callbacks Map of event name to handler function, passed
   *   directly to {@link Events}.
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
        "hook.before_connected",
        "connect.failed",
        "connect.succeed",
        "@inband",
        "close",
        "@completed",
      ],
      callbacks,
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
        this.config.host.port,
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

      case SERVER_HOOK_OUTPUT_BEFORE_CONNECTING:
        if (!this.connected) {
          return this.events.fire("hook.before_connected", rd);
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
    return this.sender.sendData(0x00, data);
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
    example: "telnet.nirui.org:23",
    readonly: false,
    suggestions(_input) {
      return [];
    },
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
          "Can no longer than " + address.MAX_ADDR_LEN + " bytes",
        );
      }

      if (addr.port <= 0) {
        throw new Error("Port must be specified");
      }

      return "Look like " + addr.type + " address";
    },
  },
  Encoding: {
    name: "Encoding",
    description: "The character encoding of the server",
    type: "select",
    value: "utf-8",
    example: common.charsetPresets.join(","),
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(d) {
      for (let i in common.charsetPresets) {
        if (common.charsetPresets[i] !== d) {
          continue;
        }

        return "";
      }

      throw new Error('The character encoding "' + d + '" is not supported');
    },
  },
};

/**
 * Multi-step interactive wizard for establishing a Telnet connection.
 *
 * Drives the user through: initial host prompt → waiting → done. Simpler than
 * the SSH wizard because there is no authentication or fingerprint step.
 *
 * @private
 */
class Wizard {
  /**
   * constructor
   *
   * @param {command.Info} info Command identity metadata.
   * @param {presets.Preset} preset Pre-filled preset (may be the empty preset).
   * @param {object} session Session data from a previous connection.
   * @param {Array<string>} keptSessions Session key names to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Channel for pushing wizard steps to the UI.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history manager.
   *
   */
  constructor(
    info,
    preset,
    session,
    keptSessions,
    streams,
    subs,
    controls,
    history,
  ) {
    this.info = info;
    this.preset = preset;
    this.hasStarted = false;
    this.streams = streams;
    this.session = session;
    this.keptSessions = keptSessions;
    this.step = subs;
    this.controls = controls.get("Telnet");
    this.history = history;
  }

  /**
   * Kick off the wizard by pushing the initial prompt step onto the channel.
   */
  run() {
    this.step.resolve(this.stepInitialPrompt());
  }

  /**
   * Return whether the user has already submitted the initial prompt.
   *
   * @returns {boolean} `true` after the first form submit.
   */
  started() {
    return this.hasStarted;
  }

  /**
   * Return the Telnet control object for this wizard's session.
   *
   * @returns {object} The Telnet control interface from {@link Controls}.
   */
  control() {
    return this.controls;
  }

  /**
   * Cancel the wizard by pushing an error-done step with a cancellation
   * message.
   */
  close() {
    this.step.resolve(
      this.stepErrorDone(
        "Action cancelled",
        "Action has been cancelled without reach any success",
      ),
    );
  }

  /**
   * Build a failure done-step with the given title and message.
   *
   * @private
   * @param {string} title Short error title.
   * @param {string} message Longer error description.
   * @returns {object} A NEXT_DONE step with `success: false`.
   */
  stepErrorDone(title, message) {
    return command.done(false, null, title, message);
  }

  /**
   * Build a wait step displaying truncated hook output from the backend.
   *
   * @private
   * @param {string} title Title of the wait state.
   * @param {string} msg Raw hook output (truncated to
   *   {@link common.MAX_HOOK_OUTPUT_LEN}).
   * @returns {object} A NEXT_WAIT step.
   */
  stepHookOutputPrompt(title, msg) {
    return command.wait(
      title,
      strings.truncate(
        msg,
        common.MAX_HOOK_OUTPUT_LEN,
        common.HOOK_OUTPUT_STR_ELLIPSIS,
      ),
    );
  }

  /**
   * Build a success done-step wrapping the provided session result.
   *
   * @private
   * @param {command.Result} data The live session result.
   * @returns {object} A NEXT_DONE step with `success: true`.
   */
  stepSuccessfulDone(data) {
    return command.done(
      true,
      data,
      "Success!",
      "We have connected to the remote",
    );
  }

  /**
   * Build a wait step shown while the backend processes the initial request.
   *
   * @private
   * @returns {object} A NEXT_WAIT step.
   */
  stepWaitForAcceptWait() {
    return command.wait(
      "Requesting",
      "Waiting for the request to be accepted by the backend",
    );
  }

  /**
   * Build a wait step shown while the TCP connection to `host` is being
   * established.
   *
   * @private
   * @param {string} host Display name of the target host.
   * @returns {object} A NEXT_WAIT step.
   */
  stepWaitForEstablishWait(host) {
    return command.wait(
      "Connecting to " + host,
      "Establishing connection with the remote host, may take a while",
    );
  }

  /**
   * Instantiate and return a {@link Telnet} command handler, wiring all event
   * callbacks to advance the wizard's step channel.
   *
   * @private
   * @param {stream.Sender} sender The stream sender allocated for this connection.
   * @param {object} configInput Validated form input (host, charset, tabColor).
   * @param {object} sessionData Mutable session object.
   * @returns {Telnet} Configured Telnet command instance.
   */
  buildCommand(sender, configInput, sessionData) {
    let self = this;

    let parsedConfig = {
      host: address.parseHostPort(configInput.host, DEFAULT_PORT),
      charset: configInput.charset,
    };

    // Copy the keptSessions from the record so it will not be overwritten here
    let keptSessions = self.keptSessions ? [].concat(...self.keptSessions) : [];

    return new Telnet(sender, parsedConfig, {
      "initialization.failed"(streamInitialHeader) {
        switch (streamInitialHeader.data()) {
          case SERVER_INITIAL_ERROR_BAD_ADDRESS:
            self.step.resolve(
              self.stepErrorDone("Request rejected", "Invalid address"),
            );

            return;
        }

        self.step.resolve(
          self.stepErrorDone(
            "Request rejected",
            "Unknown error code: " + streamInitialHeader.data(),
          ),
        );
      },
      initialized(_streamInitialHeader) {
        self.step.resolve(self.stepWaitForEstablishWait(configInput.host));
      },
      async "hook.before_connected"(rd) {
        const d = new TextDecoder("utf-8").decode(
          await reader.readCompletely(rd),
        );
        self.step.resolve(
          self.stepHookOutputPrompt("Waiting for server hook", d),
        );
      },
      "connect.succeed"(rd, commandHandler) {
        self.step.resolve(
          self.stepSuccessfulDone(
            new command.Result(
              configInput.host,
              self.info,
              self.controls.build({
                charset: parsedConfig.charset,
                tabColor: configInput.tabColor,
                send(data) {
                  return commandHandler.sendData(data);
                },
                close() {
                  return commandHandler.sendClose();
                },
                events: commandHandler.events,
              }),
              self.controls.ui(),
            ),
          ),
        );

        self.history.save(
          self.info.name() + ":" + configInput.host,
          configInput.host,
          new Date(),
          self.info,
          configInput,
          sessionData,
          keptSessions,
        );
      },
      async "connect.failed"(rd) {
        let readed = await reader.readCompletely(rd),
          message = new TextDecoder("utf-8").decode(readed.buffer);

        self.step.resolve(self.stepErrorDone("Connection failed", message));
      },
      "@inband"(_rd) {},
      close() {},
      "@completed"() {},
    });
  }

  /**
   * Build and return the first wizard step: the Telnet host prompt form.
   *
   * @private
   * @returns {object} A NEXT_PROMPT step with Host and Encoding fields.
   */
  stepInitialPrompt() {
    const self = this;

    return command.prompt(
      "Telnet",
      "Teletype Network",
      "Connect",
      (r) => {
        self.hasStarted = true;

        self.streams.request(COMMAND_ID, (sd) => {
          return self.buildCommand(
            sd,
            {
              host: r.host,
              charset: r.encoding,
              tabColor: self.preset ? self.preset.tabColor() : "",
            },
            self.session,
          );
        });

        self.step.resolve(self.stepWaitForAcceptWait());
      },
      () => {},
      command.fieldsWithPreset(
        initialFieldDef,
        [
          {
            name: "Host",
            suggestions(input) {
              const hosts = self.history.search(
                "Telnet",
                "host",
                input,
                HostMaxSearchResults,
              );

              let sugg = [];

              for (let i = 0; i < hosts.length; i++) {
                sugg.push({
                  title: hosts[i].title,
                  value: hosts[i].data.host,
                  meta: {
                    Encoding: hosts[i].data.charset,
                  },
                });
              }

              return sugg;
            },
          },
          { name: "Encoding" },
        ],
        self.preset,
        (_r) => {},
      ),
    );
  }
}

/**
 * Non-interactive Telnet executor that skips the initial host prompt.
 *
 * Used when a connection is launched programmatically from a launcher string
 * or a history entry.
 *
 * @private
 * @extends Wizard
 */
class Executor extends Wizard {
  /**
   * constructor
   *
   * @param {command.Info} info Command identity metadata.
   * @param {object} config Pre-validated connection config (host, charset,
   *   tabColor).
   * @param {object} session Session data.
   * @param {Array<string>} keptSessions Session keys to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history manager.
   *
   */
  constructor(
    info,
    config,
    session,
    keptSessions,
    streams,
    subs,
    controls,
    history,
  ) {
    super(
      info,
      presets.emptyPreset(),
      session,
      keptSessions,
      streams,
      subs,
      controls,
      history,
    );

    this.config = config;
  }

  stepInitialPrompt() {
    const self = this;

    self.hasStarted = true;

    self.streams.request(COMMAND_ID, (sd) => {
      return self.buildCommand(
        sd,
        {
          host: self.config.host,
          charset: self.config.charset ? self.config.charset : "utf-8",
          tabColor: self.config.tabColor ? self.config.tabColor : "",
        },
        self.session,
      );
    });

    return self.stepWaitForAcceptWait();
  }
}

/**
 * Public Telnet command definition registered with the {@link Commands} registry.
 *
 * Implements the full command contract used by the Sshwifty command registry:
 * `id`, `name`, `description`, `color`, `wizard`, `execute`, `launch`,
 * `launcher`, and `represet`.
 */
export class Command {
  /** constructor */
  constructor() {}

  /**
   * Return the protocol command ID for Telnet.
   *
   * @returns {number} COMMAND_ID constant (0x00).
   */
  id() {
    return COMMAND_ID;
  }

  /**
   * Return the display name of this command.
   *
   * @returns {string} `"Telnet"`
   */
  name() {
    return "Telnet";
  }

  /**
   * Return the human-readable description of this command.
   *
   * @returns {string} Short description shown in the connection picker.
   */
  description() {
    return "Teletype Network";
  }

  /**
   * Return the theme color used for Telnet session tabs.
   *
   * @returns {string} CSS color string.
   */
  color() {
    return "#6ac";
  }

  /**
   * Create an interactive Telnet wizard.
   *
   * @param {command.Info} info Command identity metadata.
   * @param {presets.Preset} preset Pre-filled preset or empty preset.
   * @param {object} session Session data.
   * @param {Array<string>} keptSessions Session keys to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Wizard} Configured Telnet wizard instance.
   */
  wizard(
    info,
    preset,
    session,
    keptSessions,
    streams,
    subs,
    controls,
    history,
  ) {
    return new Wizard(
      info,
      preset,
      session,
      keptSessions,
      streams,
      subs,
      controls,
      history,
    );
  }

  /**
   * Create a non-interactive Telnet executor from pre-validated config.
   *
   * @param {command.Info} info Command identity metadata.
   * @param {object} config Pre-validated connection config.
   * @param {object} session Session data.
   * @param {Array<string>} keptSessions Session keys to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Executor} Configured Telnet executor instance.
   */
  execute(
    info,
    config,
    session,
    keptSessions,
    streams,
    subs,
    controls,
    history,
  ) {
    return new Executor(
      info,
      config,
      session,
      keptSessions,
      streams,
      subs,
      controls,
      history,
    );
  }

  /**
   * Parse a launcher string and create a non-interactive Telnet executor.
   *
   * Launcher format: `host[:port][|charset]`
   *
   * @param {command.Info} info Command identity metadata.
   * @param {string} launcher Encoded launcher string.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Executor} Configured Telnet executor instance.
   * @throws {Exception} When the launcher string is malformed or contains
   *   invalid field values.
   */
  launch(info, launcher, streams, subs, controls, history) {
    const d = launcher.split("|", 2);

    if (d.length <= 0) {
      throw new Exception('Given launcher "' + launcher + '" was invalid');
    }

    try {
      initialFieldDef["Host"].verify(d[0]);
    } catch (e) {
      throw new Exception(
        'Given launcher "' + launcher + '" was invalid: ' + e,
      );
    }

    let charset = "utf-8";

    if (d.length > 1) {
      // TODO: Remove this check after depreciation period.
      try {
        initialFieldDef["Encoding"].verify(d[1]);

        charset = d[1];
      } catch (e) {
        throw new Exception(
          'Given launcher "' + launcher + '" was invalid: ' + e,
        );
      }
    }

    return this.execute(
      info,
      {
        host: d[0],
        charset: charset,
      },
      null,
      null,
      streams,
      subs,
      controls,
      history,
    );
  }

  /**
   * Encode a config object as a Telnet launcher string.
   *
   * @param {object} config Connection config with `host` and optionally
   *   `charset`.
   * @returns {string} Encoded launcher string (`host|charset`).
   */
  launcher(config) {
    return config.host + "|" + (config.charset ? config.charset : "utf-8");
  }

  /**
   * Promote the preset's `host` field into a `Host` meta entry so the wizard
   * can pre-populate the host input from a preset.
   *
   * @param {presets.Preset} preset The preset to modify.
   * @returns {presets.Preset} The same preset instance, possibly with a new
   *   `Host` meta entry inserted.
   */
  represet(preset) {
    const host = preset.host();

    if (host.length > 0) {
      preset.insertMeta("Host", host);
    }

    return preset;
  }
}
