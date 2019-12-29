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

import * as iconv from "iconv-lite";

import * as subscribe from "../stream/subscribe.js";
import * as reader from "../stream/reader.js";
import * as color from "../commands/color.js";
import * as common from "../commands/common.js";
import Exception from "../commands/exception.js";

// const maxReadBufSize = 1024;

const cmdSE = 240;
// const cmdNOP = 241;
// const cmdDataMark = 242;
// const cmdBreak = 243;
// const cmdInterrputProcess = 244;
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
  77
]);

// Most of code of this class is directly from
// https://github.com/ziutek/telnet/blob/master/conn.go#L122
// Thank you!
class Parser {
  constructor(sender, flusher, callbacks) {
    this.sender = sender;
    this.flusher = flusher;
    this.callbacks = callbacks;
    this.reader = new reader.Multiple(() => {});
    this.options = {
      echoEnabled: false,
      suppressGoAhead: false,
      nawsAccpeted: false
    };
    this.current = 0;
  }

  sendNego(cmd, option) {
    return this.sender(new Uint8Array([cmdIAC, cmd, option]));
  }

  sendDeny(cmd, o) {
    switch (cmd) {
      case cmdDo:
        return this.sendNego(cmdWont, o);

      case (cmdWill, cmdWont):
        return this.sendNego(cmdDont, o);
    }
  }

  sendWillSubNego(willCmd, data, option) {
    let b = new Uint8Array(6 + data.length + 2);

    b.set([cmdIAC, willCmd, option, cmdIAC, cmdSB, option], 0);
    b.set(data, 6);
    b.set([cmdIAC, cmdSE], data.length + 6);

    return this.sender(b);
  }

  sendSubNego(data, option) {
    let b = new Uint8Array(3 + data.length + 2);

    b.set([cmdIAC, cmdSB, option], 0);
    b.set(data, 3);
    b.set([cmdIAC, cmdSE], data.length + 3);

    return this.sender(b);
  }

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
          }
        );

      case optSuppressGoAhead:
        return this.handleOption(
          d[0],
          o[0],
          this.options.suppressGoAhead,
          (d, _action) => {
            this.options.suppressGoAhead = d;
          }
        );

      case optNAWS:
        // Window resize allowed?
        if (d[0] !== cmdDo) {
          this.sendDeny(d[0], o[0]);

          return;
        }

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

  requestWindowResize() {
    this.options.nawsAccpeted = true;

    this.sendNego(cmdWill, optNAWS);
  }

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

  feed(rd, cb) {
    this.reader.feed(rd, cb);
  }

  close() {
    this.reader.close();
  }
}

class Control {
  constructor(data, color) {
    this.colorM = color;
    this.colors = this.colorM.get();

    this.charset = data.charset;

    if (this.charset === "utf-8") {
      let enc = new TextEncoder();

      this.charsetDecoder = d => {
        return d;
      };

      this.charsetEncoder = dStr => {
        return enc.encode(dStr);
      };
    } else {
      let dec = new TextDecoder(this.charset),
        enc = new TextEncoder();

      this.charsetDecoder = d => {
        return enc.encode(
          dec.decode(d, {
            stream: true
          })
        );
      };

      this.charsetEncoder = dStr => {
        return iconv.encode(dStr, this.charset);
      };
    }

    this.sender = data.send;
    this.closer = data.close;
    this.closed = false;
    this.localEchoEnabled = true;
    this.subs = new subscribe.Subscribe();
    this.enable = false;
    this.windowDim = {
      cols: 65535,
      rows: 65535
    };

    let self = this;

    this.parser = new Parser(
      this.sender,
      d => {
        self.subs.resolve(this.charsetDecoder(d));
      },
      {
        setEcho(newVal) {
          self.localEchoEnabled = newVal;
        },
        getWindowDim() {
          return self.windowDim;
        }
      }
    );

    let runWait = this.parser.run();

    data.events.place("inband", rd => {
      return new Promise((resolve, _reject) => {
        self.parser.feed(rd, () => {
          resolve(true);
        });
      });
    });

    data.events.place("completed", async () => {
      self.parser.close();
      self.closed = true;

      self.colorM.forget(self.colors.color);

      await runWait;

      self.subs.reject("Remote connection has been terminated");
    });
  }

  echo() {
    return this.localEchoEnabled;
  }

  resize(dim) {
    if (this.closed) {
      return;
    }

    this.windowDim.cols = dim.cols;
    this.windowDim.rows = dim.rows;

    this.parser.requestWindowResize();
  }

  enabled() {
    this.enable = true;
  }

  disabled() {
    this.enable = false;
  }

  retap(_isOn) {}

  receive() {
    return this.subs.subscribe();
  }

  searchNextIAC(start, data) {
    for (let i = start; i < data.length; i++) {
      if (data[i] !== cmdIAC) {
        continue;
      }

      return i;
    }

    return -1;
  }

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

  send(data) {
    if (this.closed) {
      return;
    }

    this.sendSeg(this.charsetEncoder(data));
  }

  sendBinary(data) {
    if (this.closed) {
      return;
    }

    return this.sendSeg(common.strToBinary(data));
  }

  color() {
    return this.colors.dark;
  }

  activeColor() {
    return this.colors.color;
  }

  close() {
    if (this.closer === null) {
      return;
    }

    let cc = this.closer;
    this.closer = null;

    return cc();
  }
}

export class Telnet {
  /**
   * constructor
   *
   * @param {color.Color} c
   */
  constructor(c) {
    this.color = c;
  }

  type() {
    return "Telnet";
  }

  ui() {
    return "Console";
  }

  build(data) {
    return new Control(data, this.color);
  }
}
