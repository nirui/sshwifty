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
 * @file Command control registry.
 *
 * {@link Controls} maps command-type strings (e.g. `"SSH"`, `"Telnet"`) to
 * their respective control objects. Each control object is expected to expose
 * the interface used by the command's wizard to send data, resize the terminal,
 * and build the live session UI.
 */

import Exception from "./exception.js";

/**
 * Registry that maps command type names to their control interface objects.
 *
 * Populated once at startup with all registered controls; individual commands
 * look up their own control via {@link Controls#get}.
 */
export class Controls {
  /**
   * constructor
   *
   * @param {[]object} controls
   *
   * @throws {Exception} When control type already been defined
   *
   */
  constructor(controls) {
    this.controls = {};

    for (let i in controls) {
      let cType = controls[i].type();

      if (typeof this.controls[cType] === "object") {
        throw new Exception('Control "' + cType + '" already been defined');
      }

      this.controls[cType] = controls[i];
    }
  }

  /**
   * Get a control
   *
   * @param {string} type Type of the control
   *
   * @returns {object} Control object
   *
   * @throws {Exception} When given control type is undefined
   *
   */
  get(type) {
    if (typeof this.controls[type] !== "object") {
      throw new Exception('Control "' + type + '" was undefined');
    }

    return this.controls[type];
  }
}
