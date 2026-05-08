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
 * @file control/telnet.js
 * @description Telnet session control layer. Implements the Telnet protocol
 * option negotiation state machine in `Parser` (based on RFC 854 / the
 * ziutek/telnet Go reference), and the `Control` class that integrates it with
 * charset encoding/decoding and the terminal widget subscription channel.
 * Exports the {@link Telnet} factory used by the controls registry.
 */

import * as common from "../commands/common.js";
import Exception from "../commands/exception.js";
import * as reader from "../stream/reader.js";
import * as subscribe from "../stream/subscribe.js";
import * as iconvDecoder from "../iconv/decoder.js";
import * as iconvEncoder from "../iconv/encoder.js";

// const maxReadBufSize = 1024;

const cmdSE = 240;
// const cmdNOP = 241;
// const cmdDataMark = 242;
// const cmdBreak = 243;
// const cmdInterruptProcess = 244;
// const cmdAbortOutput = 245;
// const cmdAreYouThere = 246;
// const cmdEraseCharacter = 247;
// const cmdEraseLine = 248;
const cmdGoAhead = 249;
const cmdSB = 250;
const cmdWill = 251;
const cmdWont = 252;
const cmdDo = 253;
const cmdDont = 254;
const cmdIAC = 255;

const optEcho = 1;
const optSuppressGoAhead = 3;
const optTerminalType = 24;
const optNAWS = 31;

const optTerminalTypeIs = 0;
const optTerminalTypeSend = 1;

const unknownTermTypeSendData = new Uint8Array([
  optTerminalTypeIs,
  88,
  84,
  69,
  82,
  77,
]);

/**
 * Telnet protocol option negotiation parser.
 *
 * Processes the raw inband byte stream from the server, extracts IAC command
 * sequences, performs option negotiation (echo, SGA, NAWS, terminal type), and
 * passes clean printable data to `flusher`. Most of the negotiation logic is
 * ported from https://github.com/ziutek/telnet/blob/master/conn.go#L122.
 *
 * @private
 */
class Parser {
  /**
   * Creates a new Parser.
   *
   * @param {function(Uint8Array): void} sender - Sends raw bytes back to the server.
   * @param {function(Uint8Array): void} flusher - Receives decoded printable data
   *   after IAC sequences have been stripped.
   * @param {{ setEcho: function(boolean): void,
   *   getWindowDim: function(): { cols: number, rows: number } }} callbacks
   *   Callbacks for propagating negotiated echo state and querying window size.
   */
  constructor(sender, flusher, callbacks) {
    this.sender = sender;
    this.flusher = flusher;
    this.callbacks = callbacks;
    this.reader = new reader.Multiple(() => {});
    this.options = {
      echoEnabled: false,
      suppressGoAhead: false,
      nawsAccpeted: false,
    };
    this.current = 0;
  }

  /**
   * Sends a three-byte Telnet negotiation sequence `IAC cmd option`.
   *
   * @param {number} cmd - Telnet command byte (WILL/WONT/DO/DONT).
   * @param {number} option - Telnet option byte.
   * @returns {void}
   */
  sendNego(cmd, option) {
    return this.sender(new Uint8Array([cmdIAC, cmd, option]));
  }

  /**
   * Responds to a negotiation command with the appropriate denial/refusal.
   *
   * Maps `DO` → `WONT` and `WILL`/`WONT` → `DONT`.
   *
   * @param {number} cmd - The incoming Telnet command byte.
   * @param {number} o - The Telnet option byte to deny.
   * @returns {void}
   */
  sendDeny(cmd, o) {
    switch (cmd) {
      case cmdDo:
        return this.sendNego(cmdWont, o);
      case (cmdWill, cmdWont):
        return this.sendNego(cmdDont, o);
    }
  }

  /**
   * Sends a combined WILL negotiation followed by a subnegotiation frame.
   *
   * Used for NAWS: `IAC WILL option IAC SB option <data> IAC SE`.
   *
   * @param {number} willCmd - WILL command byte.
   * @param {Uint8Array} data - Subnegotiation payload.
   * @param {number} option - Telnet option byte (e.g. `optNAWS`).
   * @returns {void}
   */
  sendWillSubNego(willCmd, data, option) {
    let b = new Uint8Array(6 + data.length + 2);
    b.set([cmdIAC, willCmd, option, cmdIAC, cmdSB, option], 0);
    b.set(data, 6);
    b.set([cmdIAC, cmdSE], data.length + 6);
    return this.sender(b);
  }

  /**
   * Sends a subnegotiation frame: `IAC SB option <data> IAC SE`.
   *
   * @param {Uint8Array} data - Subnegotiation payload bytes.
   * @param {number} option - Telnet option byte.
   * @returns {void}
   */
  sendSubNego(data, option) {
    let b = new Uint8Array(3 + data.length + 2);
    b.set([cmdIAC, cmdSB, option], 0);
    b.set(data, 3);
    b.set([cmdIAC, cmdSE], data.length + 3);
    return this.sender(b);
  }

  /**
   * Reads and processes a terminal-type subnegotiation from the server.
   *
   * If the server sends `TERMINAL-TYPE SEND`, returns a deferred callback that
   * will transmit the hardcoded `XTERM` terminal type reply. Returns `null`
   * for any other action byte.
   *
   * @param {reader.Multiple} rd - Subnegotiation byte reader.
   * @returns {Promise<function|null>} A deferred send callback, or `null`.
   */
  async handleTermTypeSubNego(rd) {
    let action = await reader.readOne(rd);
    if (action[0] !== optTerminalTypeSend) {
      return null;
    }
    let self = this;
    return () => {
      self.sendSubNego(unknownTermTypeSendData, optTerminalType);
    };
  }

  /**
   * Reads and dispatches a full Telnet subnegotiation block until `IAC SE`.
   *
   * Dispatches option-specific handlers (currently only `optTerminalType`) and
   * invokes any deferred end-of-subneg callback after the `SE` byte is seen.
   *
   * @param {reader.Multiple} rd - Byte reader positioned just after `IAC SB`.
   * @returns {Promise<void>}
   */
  async handleSubNego(rd) {
    let endExec = null;
    for (;;) {
      let d = await reader.readOne(rd);
      switch (d[0]) {
        case optTerminalType:
          endExec = await this.handleTermTypeSubNego(rd);
          continue;
        case cmdIAC:
          break;
        default:
          continue;
      }
      let e = await reader.readOne(rd);
      if (e[0] !== cmdSE) {
        continue;
      }
      if (endExec !== null) {
        endExec();
      }
      return;
    }
  }

  /**
   * Processes a WILL/WONT/DO/DONT option negotiation exchange.
   *
   * Sends the appropriate acknowledgement only when the current option state
   * differs from the incoming command, avoiding negotiation loops.
   *
   * @param {number} cmd - Incoming command byte (WILL/WONT/DO/DONT).
   * @param {number} option - Telnet option byte being negotiated.
   * @param {boolean} oldVal - Current known state of this option.
   * @param {function(boolean, number): void} newVal - Callback invoked with the
   *   new state and the command that triggered the change.
   * @returns {void}
   */
  handleOption(cmd, option, oldVal, newVal) {
    switch (cmd) {
      case cmdWill:
        if (!oldVal) {
          this.sendNego(cmdDo, option);
        }
        newVal(true, cmdWill);
        return;
      case cmdWont:
        if (oldVal) {
          this.sendNego(cmdDont, option);
        }
        newVal(false, cmdWont);
        return;
      case cmdDo:
        if (!oldVal) {
          this.sendNego(cmdWill, option);
        }
        newVal(true, cmdDo);
        return;
      case cmdDont:
        if (oldVal) {
          this.sendNego(cmdWont, option);
        }
        newVal(false, cmdDont);
        return;
    }
  }

  /**
   * Reads and dispatches a single Telnet IAC command sequence.
   *
   * Handles WILL/WONT/DO/DONT option commands, escaped IAC bytes, Go-Ahead,
   * and subnegotiations. Unknown commands throw an `Exception`.
   *
   * @param {reader.Multiple} rd - Byte reader positioned just after the IAC byte.
   * @returns {Promise<void>}
   * @throws {Exception} When an unrecognised command byte is encountered.
   */
  async handleCmd(rd) {
    let d = await reader.readOne(rd);
    switch (d[0]) {
      case cmdWill:
      case cmdWont:
      case cmdDo:
      case cmdDont:
        break;
      case cmdIAC:
        this.flusher(d);
        return;
      case cmdGoAhead:
        return;
      case cmdSB:
        await this.handleSubNego(rd);
        return;
      default:
        throw new Exception("Unknown command");
    }
    let o = await reader.readOne(rd);
    switch (o[0]) {
      case optEcho:
        return this.handleOption(
          d[0],
          o[0],
          this.options.echoEnabled,
          (d, action) => {
            this.options.echoEnabled = d;
            switch (action) {
              case cmdWill:
              case cmdDont:
                this.callbacks.setEcho(false);
                break;
              case cmdWont:
              case cmdDo:
                this.callbacks.setEcho(true);
                break;
            }
          },
        );
      case optSuppressGoAhead:
        return this.handleOption(
          d[0],
          o[0],
          this.options.suppressGoAhead,
          (d, _action) => {
            this.options.suppressGoAhead = d;
          },
        );
      case optNAWS:
        // Window resize allowed?
        if (d[0] !== cmdDo) {
          this.sendDeny(d[0], o[0]);
          return;
        }
        {
          let dim = this.callbacks.getWindowDim(),
            dimData = new DataView(new ArrayBuffer(4));
          dimData.setUint16(0, dim.cols);
          dimData.setUint16(2, dim.rows);
          let dimBytes = new Uint8Array(dimData.buffer);
          if (this.options.nawsAccpeted) {
            this.sendSubNego(dimBytes, optNAWS);
            return;
          }
          this.options.nawsAccpeted = true;
          this.sendWillSubNego(cmdWill, dimBytes, optNAWS);
        }
        return;
      case optTerminalType:
        if (d[0] !== cmdDo) {
          this.sendDeny(d[0], o[0]);
          return;
        }
        this.sendNego(cmdWill, o[0]);
        return;
    }
    this.sendDeny(d[0], o[0]);
  }

  /**
   * Initiates NAWS (window-size) negotiation by sending `IAC WILL NAWS`.
   *
   * Marks `nawsAccpeted` so that subsequent NAWS DO commands trigger
   * subnegotiation instead of a fresh WILL.
   *
   * @returns {void}
   */
  requestWindowResize() {
    this.options.nawsAccpeted = true;
    this.sendNego(cmdWill, optNAWS);
  }

  /**
   * Continuously reads from the internal reader, dispatching IAC commands and
   * flushing printable data chunks to `flusher` until the reader closes.
   *
   * Silently swallows all errors (closed reader, unknown commands) to avoid
   * crashing the session when the remote sends malformed sequences.
   *
   * @returns {Promise<void>}
   */
  async run() {
    try {
      for (;;) {
        let d = await reader.readUntil(this.reader, cmdIAC);
        if (!d.found) {
          this.flusher(d.data);
          continue;
        }
        if (d.data.length > 1) {
          this.flusher(d.data.slice(0, d.data.length - 1));
        }
        await this.handleCmd(this.reader);
      }
    } catch (e) {
      // Do nothing
    }
  }

  /**
   * Feeds a new data buffer into the parser's internal multiplexed reader.
   *
   * @param {reader.Buffer} rd - Buffer to enqueue for parsing.
   * @param {function(): void} cb - Callback invoked when this buffer is fully consumed.
   * @returns {void}
   */
  feed(rd, cb) {
    this.reader.feed(rd, cb);
  }

  /**
   * Closes the parser's internal reader, unblocking any pending `run()` iteration.
   *
   * @returns {void}
   */
  close() {
    this.reader.close();
  }
}

/**
 * Runtime control object for an active Telnet session.
 *
 * Owns the `Parser` for Telnet option negotiation and the charset encode/decode
 * pipeline. Provides the same control interface as the SSH `Control` (echo,
 * resize, send, receive, close) so the terminal widget is protocol-agnostic.
 *
 * @private
 */
class Control {
  /**
   * Creates a new Telnet Control.
   *
   * @param {{ charset: string, send: function(Uint8Array): void,
   *   close: function(): void,
   *   events: { place: function(string, function): void },
   *   tabColor: string }} data - Session configuration from the connector.
   * @param {{ hex: function(): string, forget: function(): void }} color - Color
   *   token allocated for this tab's background accent.
   */
  constructor(data, color) {
    this.background = color;
    this.charset = data.charset;
    this.sender = data.send;
    this.closer = data.close;
    this.closed = false;
    this.localEchoEnabled = true;
    this.subs = new subscribe.Subscribe();
    this.enable = false;
    this.windowDim = {
      cols: 65535,
      rows: 65535,
    };
    let self = this;
    this.charsetEncoder = new iconvEncoder.IconvEncoder(
      (o) => self.sendSeg(o),
      this.charset,
    );
    let charsetDecoder = new iconvDecoder.IconvDecoder(
      (o) => self.subs.resolve(o),
      this.charset,
    );
    this.parser = new Parser(self.sender, (o) => charsetDecoder.write(o), {
      setEcho(newVal) {
        self.localEchoEnabled = newVal;
      },
      getWindowDim() {
        return self.windowDim;
      },
    });
    let runWait = this.parser.run();
    data.events.place("inband", (rd) => {
      return new Promise((resolve, _reject) => {
        self.parser.feed(rd, () => {
          resolve(true);
        });
      });
    });
    data.events.place("completed", async () => {
      self.parser.close();
      self.closed = true;
      self.background.forget();
      self.charsetEncoder.close();
      charsetDecoder.close();
      await runWait;
      self.subs.reject("Remote connection has been terminated");
    });
  }

  /**
   * Returns whether the terminal should perform local echo.
   *
   * Driven by the server's ECHO option negotiation; defaults to `true` until
   * the server sends `WILL ECHO`.
   *
   * @returns {boolean} `true` when the terminal should echo characters locally.
   */
  echo() {
    return this.localEchoEnabled;
  }

  /**
   * Updates the tracked window dimensions and initiates NAWS negotiation with
   * the Telnet server.
   *
   * No-ops when the session is closed.
   *
   * @param {{ rows: number, cols: number }} dim - New terminal dimensions.
   * @returns {void}
   */
  resize(dim) {
    if (this.closed) {
      return;
    }
    this.windowDim.cols = dim.cols;
    this.windowDim.rows = dim.rows;
    this.parser.requestWindowResize();
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
   * No-op retap handler (Telnet has no toolbar toggle behaviour).
   *
   * @param {boolean} _isOn - Toolbar toggle state (unused).
   * @returns {void}
   */
  retap(_isOn) {}

  /**
   * Returns a promise that resolves with the next decoded chunk of data
   * from the Telnet server.
   *
   * @returns {Promise<string>} Resolves with decoded terminal output, or rejects
   *   when the session is terminated.
   */
  receive() {
    return this.subs.subscribe();
  }

  /**
   * Scans `data` from `start` for the next IAC (0xFF) byte.
   *
   * @private
   * @param {number} start - Offset to begin scanning from.
   * @param {Uint8Array} enc - Buffer to scan.
   * @returns {number} Index of the first IAC byte at or after `start`, or `-1`.
   */
  searchNextIAC(start, data) {
    for (let i = start; i < data.length; i++) {
      if (data[i] !== cmdIAC) {
        continue;
      }
      return i;
    }
    return -1;
  }

  /**
   * Sends an encoded byte buffer to the Telnet server, escaping any embedded
   * IAC bytes by doubling them (as required by RFC 854).
   *
   * Splits the buffer at each IAC position and sends each segment individually
   * to ensure the escaped byte is transmitted correctly.
   *
   * @private
   * @param {Uint8Array} enc - Charset-encoded data to transmit.
   * @returns {void}
   */
  sendSeg(enc) {
    let currentLen = 0;
    while (currentLen < enc.length) {
      const iacPos = this.searchNextIAC(currentLen, enc);
      if (iacPos < 0) {
        this.sender(enc.slice(currentLen, enc.length));
        return;
      }
      this.sender(enc.slice(currentLen, iacPos + 1));
      this.sender(enc.slice(iacPos, iacPos + 1));
      currentLen = iacPos + 1;
    }
  }

  /**
   * Sends a string to the Telnet server, encoding it with the session charset
   * and escaping IAC bytes.
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
   * Sends raw binary data to the Telnet server, escaping IAC bytes, without
   * charset encoding.
   *
   * No-ops when the session is already closed.
   *
   * @param {string} data - Binary string to transmit (e.g. special key sequences).
   * @returns {void}
   */
  sendBinary(data) {
    if (this.closed) {
      return;
    }
    return this.sendSeg(common.strToBinary(data));
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
   * Closes the underlying Telnet session by calling the closer callback exactly once.
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
 * Telnet protocol entry in the controls registry.
 *
 * Registered alongside `SSH` in `app.js` via the `Controls` constructor.
 * Provides factory metadata and creates `Control` instances with an allocated
 * background color token.
 */
export class Telnet {
  /**
   * Creates a new Telnet controls factory.
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
   * @returns {string} Always `"Telnet"`.
   */
  type() {
    return "Telnet";
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
   * Allocates a background color and constructs a new Telnet `Control` instance.
   *
   * @param {{ charset: string, send: function, close: function,
   *   events: object, tabColor: string }} data - Session configuration from
   *   the connector.
   * @returns {Control} The new Telnet session control object.
   */
  build(data) {
    return new Control(data, this.colors.get(data.tabColor));
  }
}
