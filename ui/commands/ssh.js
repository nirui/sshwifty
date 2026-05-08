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
 * @file SSH command implementation for the Sshwifty UI.
 *
 * Exposes {@link Command} — the public entry point registered with the command
 * registry — and the private {@link SSH}, {@link Wizard}, and {@link Executer}
 * classes that handle the full SSH connection lifecycle: initial handshake,
 * fingerprint verification, credential prompting, and live session I/O.
 */

import * as reader from "../stream/reader.js";
import * as address from "./address.js";
import * as command from "./commands.js";
import * as common from "./common.js";
import * as event from "./events.js";
import Exception from "./exception.js";
import * as presets from "./presets.js";
import * as strings from "./string.js";

const AUTHMETHOD_NONE = 0x00;
const AUTHMETHOD_PASSPHRASE = 0x01;
const AUTHMETHOD_PRIVATE_KEY = 0x02;

const COMMAND_ID = 0x01;

const MAX_USERNAME_LEN = 127;
const MAX_PASSWORD_LEN = 4096;
const DEFAULT_PORT = 22;

const SERVER_REMOTE_STDOUT = 0x00;
const SERVER_REMOTE_STDERR = 0x01;
const SERVER_HOOK_OUTPUT_BEFORE_CONNECTING = 0x02;
const SERVER_CONNECT_FAILED = 0x03;
const SERVER_CONNECTED = 0x04;
const SERVER_CONNECT_REQUEST_FINGERPRINT = 0x05;
const SERVER_CONNECT_REQUEST_CREDENTIAL = 0x06;

const CLIENT_DATA_STDIN = 0x00;
const CLIENT_DATA_RESIZE = 0x01;
const CLIENT_CONNECT_RESPOND_FINGERPRINT = 0x02;
const CLIENT_CONNECT_RESPOND_CREDENTIAL = 0x03;

const SERVER_REQUEST_ERROR_BAD_USERNAME = 0x01;
const SERVER_REQUEST_ERROR_BAD_ADDRESS = 0x02;
const SERVER_REQUEST_ERROR_BAD_AUTHMETHOD = 0x03;

const FingerprintPromptVerifyPassed = 0x00;
const FingerprintPromptVerifyNoRecord = 0x01;
const FingerprintPromptVerifyMismatch = 0x02;

const HostMaxSearchResults = 3;

/**
 * SSH command handler for a single active stream.
 *
 * Manages the SSH lifecycle events (fingerprint, credential, connected, etc.)
 * by dispatching them through an {@link Events} instance. Exposes methods for
 * sending stdin data, resize requests, and close signals.
 *
 * @private
 */
class SSH {
  /**
   * constructor
   *
   * @param {stream.Sender} sd Stream sender used to write to the remote.
   * @param {object} config Parsed connection configuration (user, host, auth,
   *   charset, credential, fingerprint).
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
        "connect.fingerprint",
        "connect.credential",
        "@stdout",
        "@stderr",
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
    let user = new strings.String(this.config.user),
      userBuf = user.buffer(),
      addr = new address.Address(
        this.config.host.type,
        this.config.host.address,
        this.config.host.port,
      ),
      addrBuf = addr.buffer(),
      authMethod = new Uint8Array([this.config.auth]);

    let data = new Uint8Array(userBuf.length + addrBuf.length + 1);

    data.set(userBuf, 0);
    data.set(addrBuf, userBuf.length);
    data.set(authMethod, userBuf.length + addrBuf.length);

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
      case SERVER_CONNECT_REQUEST_CREDENTIAL:
        if (!this.connected) {
          return this.events.fire("connect.credential", rd, this.sender);
        }
        break;

      case SERVER_CONNECT_REQUEST_FINGERPRINT:
        if (!this.connected) {
          return this.events.fire("connect.fingerprint", rd, this.sender);
        }
        break;

      case SERVER_CONNECTED:
        if (!this.connected) {
          this.connected = true;

          return this.events.fire("connect.succeed", rd, this);
        }
        break;

      case SERVER_CONNECT_FAILED:
        if (!this.connected) {
          return this.events.fire("connect.failed", rd);
        }
        break;

      case SERVER_HOOK_OUTPUT_BEFORE_CONNECTING:
        if (!this.connected) {
          return this.events.fire("hook.before_connected", rd);
        }
        break;

      case SERVER_REMOTE_STDERR:
        if (this.connected) {
          return this.events.fire("stderr", rd);
        }
        break;

      case SERVER_REMOTE_STDOUT:
        if (this.connected) {
          return this.events.fire("stdout", rd);
        }
        break;
    }

    throw new Exception("Unknown stream header marker");
  }

  /**
   * Send close signal to remote
   *
   */
  async sendClose() {
    return await this.sender.close();
  }

  /**
   * Send data to remote
   *
   * @param {Uint8Array} data
   *
   */
  async sendData(data) {
    return this.sender.sendData(CLIENT_DATA_STDIN, data);
  }

  /**
   * Send resize request
   *
   * @param {number} rows
   * @param {number} cols
   *
   */
  async sendResize(rows, cols) {
    let data = new DataView(new ArrayBuffer(4));

    data.setUint16(0, rows);
    data.setUint16(2, cols);

    return this.sender.send(CLIENT_DATA_RESIZE, new Uint8Array(data.buffer));
  }

  /**
   * Close the command
   *
   */
  async close() {
    await this.sendClose();

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
    description: "",
    type: "text",
    value: "",
    example: "ssh.nirui.org:22",
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
  User: {
    name: "User",
    description: "",
    type: "text",
    value: "",
    example: "guest",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(d) {
      if (d.length <= 0) {
        throw new Error("Username must be specified");
      }

      if (d.length > MAX_USERNAME_LEN) {
        throw new Error(
          "Username must not longer than " + MAX_USERNAME_LEN + " bytes",
        );
      }

      return "We'll login as user \"" + d + '"';
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
  Notice: {
    name: "Notice",
    description: "",
    type: "textdata",
    value:
      "SSH session is handled by the backend. Traffic will be decrypted " +
      "on the backend server and then transmit back to your client.",
    example: "",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(_d) {
      return "";
    },
  },
  Password: {
    name: "Password",
    description: "",
    type: "password",
    value: "",
    example: "----------",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(d) {
      if (d.length <= 0) {
        throw new Error("Password must be specified");
      }

      if (d.length > MAX_PASSWORD_LEN) {
        throw new Error(
          "It's too long, make it shorter than " + MAX_PASSWORD_LEN + " bytes",
        );
      }

      return "We'll login with this password";
    },
  },
  "Private Key": {
    name: "Private Key",
    description:
      'Like the one inside <i style="color: #fff; font-style: normal;">' +
      "~/.ssh/id_rsa</i>, can&apos;t be encrypted<br /><br />" +
      'To decrypt the Private Key, use command: <i style="color: #fff;' +
      ' font-style: normal;">ssh-keygen -f /path/to/private_key -p</i><br />' +
      "<br />" +
      "It is strongly recommended to use one Private Key per SSH server if " +
      "the Private Key will be submitted to Sshwifty. To generate a new SSH " +
      'key pair, use command <i style="color: #fff; font-style: normal;">' +
      "ssh-keygen -o -f /path/to/my_server_key</i> and then deploy the " +
      'generated <i style="color: #fff; font-style: normal;">' +
      "/path/to/my_server_key.pub</i> file onto the target SSH server",
    type: "textfile",
    value: "",
    example: "",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(d) {
      if (d.length <= 0) {
        throw new Error("Private Key must be specified");
      }

      if (d.length > MAX_PASSWORD_LEN) {
        throw new Error(
          "It's too long, make it shorter than " + MAX_PASSWORD_LEN + " bytes",
        );
      }

      const lines = d.trim().split("\n");
      let firstLineReaded = false;

      for (let i in lines) {
        if (!firstLineReaded) {
          if (lines[i].indexOf("-") === 0) {
            firstLineReaded = true;

            if (lines[i].indexOf("RSA") <= 0) {
              break;
            }
          }

          continue;
        }

        if (lines[i].indexOf("Proc-Type: 4,ENCRYPTED") === 0) {
          throw new Error("Cannot use encrypted Private Key file");
        }

        if (lines[i].indexOf(":") > 0) {
          continue;
        }

        if (lines[i].indexOf("MII") < 0) {
          throw new Error("Cannot use encrypted Private Key file");
        }

        break;
      }

      return "We'll login with this Private Key";
    },
  },
  Authentication: {
    name: "Authentication",
    description:
      "Please make sure the authentication method that you selected is " +
      "supported by the server, otherwise it will be ignored and likely " +
      "cause the login to fail",
    type: "radio",
    value: "",
    example: "Password,Private Key,None",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(d) {
      switch (d) {
        case "Password":
        case "Private Key":
        case "None":
          return "";

        default:
          throw new Error("Authentication method must be specified");
      }
    },
  },
  Fingerprint: {
    name: "Fingerprint",
    description:
      "Please carefully verify the fingerprint. DO NOT continue " +
      "if the fingerprint is unknown to you, otherwise you maybe " +
      "giving your own secrets to an imposter",
    type: "textdata",
    value: "",
    example: "",
    readonly: false,
    suggestions(_input) {
      return [];
    },
    verify(_d) {
      return "";
    },
  },
};

/**
 * Return auth method from given string
 *
 * @param {string} d string data
 *
 * @returns {number} Auth method
 *
 * @throws {Exception} When auth method is invalid
 *
 */
function getAuthMethodFromStr(d) {
  switch (d) {
    case "None":
      return AUTHMETHOD_NONE;

    case "Password":
      return AUTHMETHOD_PASSPHRASE;

    case "Private Key":
      return AUTHMETHOD_PRIVATE_KEY;

    default:
      throw new Exception("Unknown Auth method");
  }
}

/**
 * Multi-step interactive wizard for establishing an SSH connection.
 *
 * Drives the user through: initial prompt → (optional) fingerprint verify →
 * (optional) credential prompt → waiting → done. Each step is pushed onto
 * the `subs` channel for the parent {@link commands.Wizard} to consume.
 *
 * @private
 */
class Wizard {
  /**
   * constructor
   *
   * @param {command.Info} info Command identity metadata.
   * @param {presets.Preset} preset Pre-filled preset (may be the empty preset).
   * @param {object} session Session data from a previous connection (e.g.
   *   cached credential).
   * @param {Array<string>} keptSessions Session key names to persist across
   *   page reloads.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Channel for pushing wizard steps to the UI.
   * @param {controls.Controls} controls Control registry for looking up the
   *   SSH control object.
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
    this.session = session
      ? session
      : {
          credential: "",
        };
    this.keptSessions = keptSessions;
    this.step = subs;
    this.controls = controls.get("SSH");
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
   * Return the SSH control object for this wizard's session.
   *
   * @returns {object} The SSH control interface from {@link Controls}.
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
   * @param {string} title Short error title displayed in the UI.
   * @param {string} message Longer error description.
   * @returns {object} A NEXT_DONE step with `success: false`.
   */
  stepErrorDone(title, message) {
    return command.done(false, null, title, message);
  }

  /**
   * Build a success done-step wrapping the provided session result.
   *
   * @private
   * @param {command.Result} data The live session result to hand to the UI.
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
   * Build a generic "still connecting" wait step used after the fingerprint or
   * credential prompt is dismissed.
   *
   * @private
   * @returns {object} A NEXT_WAIT step.
   */
  stepContinueWaitForEstablishWait() {
    return command.wait(
      "Connecting",
      "Establishing connection with the remote host, may take a while",
    );
  }

  /**
   * Instantiate and return an {@link SSH} command handler, wiring all event
   * callbacks to advance the wizard's step channel.
   *
   * @private
   * @param {stream.Sender} sender The stream sender allocated for this connection.
   * @param {object} configInput Validated form input (user, host, authentication,
   *   charset, tabColor, fingerprint).
   * @param {object} sessionData Mutable session object (credential cache, etc.).
   * @returns {SSH} Configured SSH command instance.
   */
  buildCommand(sender, configInput, sessionData) {
    let self = this;

    let config = {
      user: common.strToUint8Array(configInput.user),
      auth: getAuthMethodFromStr(configInput.authentication),
      charset: configInput.charset,
      credential: sessionData.credential,
      host: address.parseHostPort(configInput.host, DEFAULT_PORT),
      fingerprint: configInput.fingerprint,
    };

    // Copy the keptSessions from the record so it will not be overwritten here
    let keptSessions = self.keptSessions ? [].concat(...self.keptSessions) : [];

    return new SSH(sender, config, {
      "initialization.failed"(hd) {
        switch (hd.data()) {
          case SERVER_REQUEST_ERROR_BAD_USERNAME:
            self.step.resolve(
              self.stepErrorDone("Request failed", "Invalid username"),
            );
            return;

          case SERVER_REQUEST_ERROR_BAD_ADDRESS:
            self.step.resolve(
              self.stepErrorDone("Request failed", "Invalid address"),
            );
            return;

          case SERVER_REQUEST_ERROR_BAD_AUTHMETHOD:
            self.step.resolve(
              self.stepErrorDone(
                "Request failed",
                "Invalid authication method",
              ),
            );
            return;
        }

        self.step.resolve(
          self.stepErrorDone("Request failed", "Unknown error: " + hd.data()),
        );
      },
      initialized(_hd) {
        self.step.resolve(self.stepWaitForEstablishWait(configInput.host));
      },
      async "connect.failed"(rd) {
        let d = new TextDecoder("utf-8").decode(
          await reader.readCompletely(rd),
        );
        self.step.resolve(self.stepErrorDone("Connection failed", d));
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
        self.connectionSucceed = true;

        self.step.resolve(
          self.stepSuccessfulDone(
            new command.Result(
              configInput.user + "@" + configInput.host,
              self.info,
              self.controls.build({
                charset: configInput.charset,
                tabColor: configInput.tabColor,
                send(data) {
                  return commandHandler.sendData(data);
                },
                close() {
                  return commandHandler.sendClose();
                },
                resize(rows, cols) {
                  return commandHandler.sendResize(rows, cols);
                },
                events: commandHandler.events,
              }),
              self.controls.ui(),
            ),
          ),
        );

        self.history.save(
          self.info.name() + ":" + configInput.user + "@" + configInput.host,
          configInput.user + "@" + configInput.host,
          new Date(),
          self.info,
          configInput,
          sessionData,
          keptSessions,
        );
      },
      async "connect.fingerprint"(rd, sd) {
        self.step.resolve(
          await self.stepFingerprintPrompt(
            rd,
            sd,
            (v) => {
              if (!configInput.fingerprint) {
                return FingerprintPromptVerifyNoRecord;
              }

              if (configInput.fingerprint === v) {
                return FingerprintPromptVerifyPassed;
              }

              return FingerprintPromptVerifyMismatch;
            },
            (newFingerprint) => {
              configInput.fingerprint = newFingerprint;
            },
          ),
        );
      },
      async "connect.credential"(rd, sd) {
        self.step.resolve(
          self.stepCredentialPrompt(rd, sd, config, (newCred, fromPreset) => {
            sessionData.credential = newCred;

            // Save the credential if the credential was from a preset
            if (fromPreset && keptSessions.indexOf("credential") < 0) {
              keptSessions.push("credential");
            }
          }),
        );
      },
      "@stdout"(_rd) {},
      "@stderr"(_rd) {},
      close() {},
      "@completed"() {
        self.step.resolve(
          self.stepErrorDone(
            "Operation has failed",
            "Connection has been cancelled",
          ),
        );
      },
    });
  }

  /**
   * Build and return the first wizard step: the SSH connection prompt form.
   *
   * @private
   * @returns {object} A NEXT_PROMPT step with Host, User, Authentication,
   *   Encoding, and Notice fields.
   */
  stepInitialPrompt() {
    let self = this;

    return command.prompt(
      "SSH",
      "Secure Shell Host",
      "Connect",
      (r) => {
        self.hasStarted = true;

        self.streams.request(COMMAND_ID, (sd) => {
          return self.buildCommand(
            sd,
            {
              user: r.user,
              authentication: r.authentication,
              host: r.host,
              charset: r.encoding,
              tabColor: self.preset ? self.preset.tabColor() : "",
              fingerprint: self.preset
                ? self.preset.metaDefault("Fingerprint", "")
                : "",
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
                "SSH",
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
                    User: hosts[i].data.user,
                    Authentication: hosts[i].data.authentication,
                    Encoding: hosts[i].data.charset,
                  },
                });
              }

              return sugg;
            },
          },
          { name: "User" },
          { name: "Authentication" },
          { name: "Encoding" },
          { name: "Notice" },
        ],
        self.preset,
        (_r) => {},
      ),
    );
  }

  /**
   * Read the server fingerprint from the stream and prompt the user to accept
   * or reject it. Automatically accepts if the fingerprint matches the stored
   * value.
   *
   * @private
   * @param {reader.Limited} rd Data reader containing the fingerprint bytes.
   * @param {stream.Sender} sd Stream sender used to respond to the backend.
   * @param {function(string): number} verify Called with the raw fingerprint
   *   string; returns a `FingerprintPromptVerify*` constant.
   * @param {function(string): void} newFingerprint Called with the accepted
   *   fingerprint string so it can be persisted.
   * @returns {Promise<object>} The next wizard step (wait or prompt).
   */
  async stepFingerprintPrompt(rd, sd, verify, newFingerprint) {
    const self = this;

    let fingerprintData = new TextDecoder("utf-8").decode(
        await reader.readCompletely(rd),
      ),
      fingerprintChanged = false;

    switch (verify(fingerprintData)) {
      case FingerprintPromptVerifyPassed:
        sd.send(CLIENT_CONNECT_RESPOND_FINGERPRINT, new Uint8Array([0]));

        return self.stepContinueWaitForEstablishWait();

      case FingerprintPromptVerifyMismatch:
        fingerprintChanged = true;
    }

    return command.prompt(
      !fingerprintChanged
        ? "Do you recognize this server?"
        : "Danger! Server fingerprint has changed!",
      !fingerprintChanged
        ? "Verify server fingerprint displayed below"
        : "It's very unusual. Please verify the new server fingerprint below",
      !fingerprintChanged ? "Yes, I do" : "I'm aware of the change",
      (_r) => {
        newFingerprint(fingerprintData);

        sd.send(CLIENT_CONNECT_RESPOND_FINGERPRINT, new Uint8Array([0]));

        self.step.resolve(self.stepContinueWaitForEstablishWait());
      },
      () => {
        sd.send(CLIENT_CONNECT_RESPOND_FINGERPRINT, new Uint8Array([1]));

        self.step.resolve(
          command.wait("Rejecting", "Sending rejection to the backend"),
        );
      },
      command.fields(initialFieldDef, [
        {
          name: "Fingerprint",
          value: fingerprintData,
        },
      ]),
    );
  }

  /**
   * Build a wait step that displays truncated hook output from the backend.
   *
   * @private
   * @param {string} title Title of the wait state.
   * @param {string} msg Raw hook output string (truncated to
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
   * If a cached credential is available, send it immediately. Otherwise prompt
   * the user for a password or private key depending on the configured auth
   * method.
   *
   * @private
   * @param {reader.Limited} rd Data reader (unused; present for signature
   *   uniformity with other step methods).
   * @param {stream.Sender} sd Stream sender used to transmit the credential.
   * @param {object} config Parsed SSH config with `auth` and `credential`.
   * @param {function(string, boolean): void} newCredential Callback with the
   *   submitted credential value and a flag indicating whether it came from a
   *   preset.
   * @returns {Promise<object>} The next wizard step (wait or credential prompt).
   */
  async stepCredentialPrompt(rd, sd, config, newCredential) {
    const self = this;

    let fields = [];

    if (config.credential.length > 0) {
      sd.send(
        CLIENT_CONNECT_RESPOND_CREDENTIAL,
        new TextEncoder().encode(config.credential),
      );

      return self.stepContinueWaitForEstablishWait();
    }

    switch (config.auth) {
      case AUTHMETHOD_PASSPHRASE:
        fields = [{ name: "Password" }];
        break;

      case AUTHMETHOD_PRIVATE_KEY:
        fields = [{ name: "Private Key" }];
        break;

      default:
        throw new Exception(
          'Auth method "' + config.auth + '" was unsupported',
        );
    }

    let presetCredentialUsed = false;
    const inputFields = command.fieldsWithPreset(
      initialFieldDef,
      fields,
      self.preset,
      (r) => {
        if (r !== fields[0].name) {
          return;
        }

        presetCredentialUsed = true;
      },
    );

    return command.prompt(
      "Provide credential",
      "Please input your credential",
      "Login",
      (r) => {
        let vv = r[fields[0].name.toLowerCase()];

        sd.send(
          CLIENT_CONNECT_RESPOND_CREDENTIAL,
          new TextEncoder().encode(vv),
        );

        newCredential(vv, presetCredentialUsed);

        self.step.resolve(self.stepContinueWaitForEstablishWait());
      },
      () => {
        sd.close();

        self.step.resolve(
          command.wait(
            "Cancelling login",
            "Cancelling login request, please wait",
          ),
        );
      },
      inputFields,
    );
  }
}

/**
 * Non-interactive SSH executor that skips the initial prompt.
 *
 * Used when a connection is launched programmatically from a launcher string
 * or a history entry rather than through the interactive wizard UI.
 *
 * @private
 * @extends Wizard
 */
class Executer extends Wizard {
  /**
   * constructor
   *
   * @param {command.Info} info Command identity metadata.
   * @param {object} config Pre-validated connection config (user, host,
   *   authentication, charset, tabColor, fingerprint).
   * @param {object} session Session data from a previous connection.
   * @param {Array<string>} keptSessions Session key names to persist.
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
          user: self.config.user,
          authentication: self.config.authentication,
          host: self.config.host,
          charset: self.config.charset ? self.config.charset : "utf-8",
          tabColor: self.config.tabColor ? self.config.tabColor : "",
          fingerprint: self.config.fingerprint,
        },
        self.session,
      );
    });

    return self.stepWaitForAcceptWait();
  }
}

/**
 * Public SSH command definition registered with the {@link Commands} registry.
 *
 * Implements the command contract: `id`, `name`, `description`, `color`,
 * `wizard`, `execute`, `launch`, `launcher`, and `represet`. The UI uses these
 * methods to display the command in menus, start interactive or automated
 * sessions, and serialise/deserialise launcher strings.
 */
export class Command {
  /** constructor */
  constructor() {}

  /**
   * Return the protocol command ID for SSH.
   *
   * @returns {number} COMMAND_ID constant (0x01).
   */
  id() {
    return COMMAND_ID;
  }

  /**
   * Return the display name of this command.
   *
   * @returns {string} `"SSH"`
   */
  name() {
    return "SSH";
  }

  /**
   * Return the human-readable description of this command.
   *
   * @returns {string} Short description shown in the connection picker.
   */
  description() {
    return "Secure Shell Host";
  }

  /**
   * Return the theme color used for SSH session tabs.
   *
   * @returns {string} CSS color string.
   */
  color() {
    return "#3c8";
  }

  /**
   * Create an interactive SSH wizard for the given streams session.
   *
   * @param {command.Info} info Command identity metadata.
   * @param {presets.Preset} preset Pre-filled preset or empty preset.
   * @param {object} session Session data.
   * @param {Array<string>} keptSessions Session keys to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Wizard} Configured SSH wizard instance.
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
   * Create a non-interactive SSH executor from pre-validated config.
   *
   * @param {command.Info} info Command identity metadata.
   * @param {object} config Pre-validated connection config.
   * @param {object} session Session data.
   * @param {Array<string>} keptSessions Session keys to persist.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Executer} Configured SSH executer instance.
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
    return new Executer(
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
   * Parse a launcher string and create a non-interactive SSH executor.
   *
   * Launcher format: `user@host|AuthMethod[|charset]`
   *
   * @param {command.Info} info Command identity metadata.
   * @param {string} launcher Encoded launcher string.
   * @param {streams.Streams} streams Active stream multiplexer.
   * @param {subscribe.Subscribe} subs Step channel.
   * @param {controls.Controls} controls Control registry.
   * @param {history.History} history Connection history.
   * @returns {Executer} Configured SSH executer instance.
   * @throws {Exception} When the launcher string is malformed or contains
   *   invalid field values.
   */
  launch(info, launcher, streams, subs, controls, history) {
    const d = launcher.split("|", 3);

    if (d.length < 2) {
      throw new Exception('Given launcher "' + launcher + '" was invalid');
    }

    const userHostName = d[0].match(new RegExp("^(.*)\\@(.*)$"));

    if (!userHostName || userHostName.length !== 3) {
      throw new Exception('Given launcher "' + launcher + '" was malformed');
    }

    let user = userHostName[1],
      host = userHostName[2],
      auth = d[1],
      charset = d.length >= 3 && d[2] ? d[2] : "utf-8"; // RM after depreciation

    try {
      initialFieldDef["User"].verify(user);
      initialFieldDef["Host"].verify(host);
      initialFieldDef["Authentication"].verify(auth);
      initialFieldDef["Encoding"].verify(charset);
    } catch (e) {
      throw new Exception(
        'Given launcher "' + launcher + '" was malformed ' + e,
      );
    }

    return this.execute(
      info,
      {
        user: user,
        host: host,
        authentication: auth,
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
   * Encode a config object as an SSH launcher string.
   *
   * @param {object} config Connection config with `user`, `host`,
   *   `authentication`, and optionally `charset`.
   * @returns {string} Encoded launcher string (`user@host|auth|charset`).
   */
  launcher(config) {
    return (
      config.user +
      "@" +
      config.host +
      "|" +
      config.authentication +
      "|" +
      (config.charset ? config.charset : "utf-8")
    );
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
