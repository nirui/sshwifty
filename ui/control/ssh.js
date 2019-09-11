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

import * as subscribe from "../stream/subscribe.js";
import * as reader from "../stream/reader.js";
import * as color from "../commands/color.js";

class Control {
  constructor(data, color) {
    this.colorM = color;
    this.colors = this.colorM.get();

    this.enable = false;
    this.sender = data.send;
    this.closer = data.close;
    this.resizer = data.resize;
    this.subs = new subscribe.Subscribe();

    let self = this;

    data.events.place("stdout", async rd => {
      try {
        self.subs.resolve(await reader.readCompletely(rd));
      } catch (e) {
        // Do nothing
      }
    });

    data.events.place("stderr", async rd => {
      try {
        self.subs.resolve(await reader.readCompletely(rd));
      } catch (e) {
        // Do nothing
      }
    });

    data.events.place("completed", () => {
      self.closed = true;
      self.colorM.forget(self.colors.color);

      self.subs.reject("Remote connection has been terminated");
    });
  }

  echo() {
    return false;
  }

  resize(dim) {
    if (this.closed) {
      return;
    }

    this.resizer(dim.rows, dim.cols);
  }

  ui() {
    return "Console";
  }

  enabled() {
    this.enable = true;
  }

  disabled() {
    this.enable = false;
  }

  retap(isOn) {}

  receive() {
    return this.subs.subscribe();
  }

  send(data) {
    if (this.closed) {
      return;
    }

    return this.sender(new TextEncoder("utf-8").encode(data));
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

export class SSH {
  /**
   * constructor
   *
   * @param {color.Color} c
   */
  constructor(c) {
    this.color = c;
  }

  type() {
    return "SSH";
  }

  build(data) {
    return new Control(data, this.color);
  }
}
