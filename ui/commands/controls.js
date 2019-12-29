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
