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
 * @file control/ssh.js
 * @description SSH session control layer. Provides the `Control` class that
 * bridges the raw SSH byte stream (stdout/stderr/completed events) with the
 * terminal widget via a charset-aware decoder/encoder pair and a
 * subscription-based receive channel. Exports the {@link SSH} factory used by
 * the controls registry.
 */

import * as common from "../commands/common.js";
import * as reader from "../stream/reader.js";
import * as subscribe from "../stream/subscribe.js";
import * as iconvDecoder from "../iconv/decoder.js";
import * as iconvEncoder from "../iconv/encoder.js";

/**
 * Runtime control object for an active SSH session.
 *
 * Wires stream events (`stdout`, `stderr`, `completed`) to a charset decoder
 * and exposes a subscription channel for the terminal widget. Outbound data
 * is routed through a charset encoder before being sent over the raw socket.
 *
 * @private
 */
class Control {
  /**
   * Creates a new SSH Control.
   *
   * @param {{ charset: string, send: function(Uint8Array): void,
   *   close: function(): void, resize: function(number, number): void,
   *   events: { place: function(string, function): void },
   *   tabColor: string }} data - Session configuration supplied by the connector.
   * @param {{ hex: function(): string, forget: function(): void }} color - Color
   *   token allocated for this tab's background accent.
   */
  constructor(data, color) {
    this.background = color;
    this.charset = data.charset;
    this.enable = false;
    this.sender = data.send;
    this.closer = data.close;
    this.closed = false;
    this.resizer = data.resize;
    this.subs = new subscribe.Subscribe();
    let self = this;
    this.charsetEncoder = new iconvEncoder.IconvEncoder(
      (o) => self.sender(o),
      this.charset,
    );
    let charsetDecoder = new iconvDecoder.IconvDecoder(
      (o) => self.subs.resolve(o),
      this.charset,
    );
    data.events.place("stdout", async (rd) => {
      try {
        charsetDecoder.write(await reader.readCompletely(rd));
      } catch (e) {
        // Do nothing
      }
    });
    data.events.place("stderr", async (rd) => {
      try {
        charsetDecoder.write(await reader.readCompletely(rd));
      } catch (e) {
        // Do nothing
      }
    });
    data.events.place("completed", () => {
      self.closed = true;
      self.background.forget();
      self.charsetEncoder.close();
      charsetDecoder.close();
      self.subs.reject("Remote connection has been terminated");
    });
  }

  /**
   * Returns whether the terminal should perform local echo for this connection.
   *
   * SSH servers echo characters themselves, so local echo is always disabled.
   *
   * @returns {boolean} Always `false` for SSH sessions.
   */
  echo() {
    return false;
  }

  /**
   * Sends a terminal resize notification to the SSH server.
   *
   * No-ops when the session is already closed.
   *
   * @param {{ rows: number, cols: number }} dim - New terminal dimensions.
   * @returns {void}
   */
  resize(dim) {
    if (this.closed) {
      return;
    }
    this.resizer(dim.rows, dim.cols);
  }

  /**
   * Marks the control as enabled (the tab is currently active/focused).
   *
   * @returns {void}
   */
  enabled() {
    this.enable = true;
  }

  /**
   * Marks the control as disabled (the tab is in the background).
   *
   * @returns {void}
   */
  disabled() {
    this.enable = false;
  }

  /**
   * No-op retap handler (SSH has no toolbar toggle behaviour).
   *
   * @param {boolean} _isOn - Toolbar toggle state (unused).
   * @returns {void}
   */
  retap(_isOn) {}

  /**
   * Returns a promise that resolves with the next decoded chunk of data
   * from the SSH server.
   *
   * @returns {Promise<string>} Resolves with decoded terminal output, or rejects
   *   when the session is terminated.
   */
  receive() {
    return this.subs.subscribe();
  }

  /**
   * Sends a string to the SSH server after encoding it with the session charset.
   *
   * No-ops when the session is already closed.
   *
   * @param {string} data - The text to send.
   * @returns {void}
   */
  send(data) {
    if (this.closed) {
      return;
    }
    return this.charsetEncoder.write(data);
  }

  /**
   * Sends raw binary data directly over the socket without charset encoding.
   *
   * No-ops when the session is already closed.
   *
   * @param {string} data - Binary string to transmit (e.g. escape sequences).
   * @returns {void}
   */
  sendBinary(data) {
    if (this.closed) {
      return;
    }
    return this.sender(common.strToBinary(data));
  }

  /**
   * Returns the hex color string for this tab's background accent.
   *
   * @returns {string} CSS hex color (e.g. `"#3a7bd5"`).
   */
  color() {
    return this.background.hex();
  }

  /**
   * Closes the underlying SSH session by calling the closer callback exactly once.
   *
   * Subsequent calls are no-ops (the closer is nulled out after first invocation).
   *
   * @returns {void}
   */
  close() {
    if (this.closer === null) {
      return;
    }
    let cc = this.closer;
    this.closer = null;
    return cc();
  }
}

/**
 * SSH protocol entry in the controls registry.
 *
 * Registered alongside `Telnet` in `app.js` via the `Controls` constructor.
 * Provides factory metadata (`type`, `ui`) and creates `Control` instances
 * with an allocated background color token.
 */
export class SSH {
  /**
   * Creates a new SSH controls factory.
   *
   * @param {import('../commands/color.js').Colors} c - Shared color pool from
   *   which tab background colors are allocated.
   */
  constructor(c) {
    this.colors = c;
  }

  /**
   * Returns the protocol identifier used by the controls registry.
   *
   * @returns {string} Always `"SSH"`.
   */
  type() {
    return "SSH";
  }

  /**
   * Returns the UI widget name that should be used to render this session.
   *
   * @returns {string} Always `"Console"`.
   */
  ui() {
    return "Console";
  }

  /**
   * Allocates a background color and constructs a new SSH `Control` instance.
   *
   * @param {{ charset: string, send: function, close: function,
   *   resize: function, events: object, tabColor: string }} data - Session
   *   configuration from the connector.
   * @returns {Control} The new SSH session control object.
   */
  build(data) {
    return new Control(data, this.colors.get(data.tabColor));
  }
}
