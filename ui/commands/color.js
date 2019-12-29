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

/**
 * Get one color hex byte
 *
 * @param {number} from Min color number
 * @param {number} to Max color number
 *
 * @returns {string} color byte in string
 *
 */
function getRandHex(from, to) {
  let color = Math.random() * (to - from) + from,
    colorDark = color - color / 20;

  let r = Math.round(color).toString(16),
    rDark = Math.round(colorDark).toString(16);

  if (r.length % 2 !== 0) {
    r = "0" + r;
  }

  if (rDark.length % 2 !== 0) {
    rDark = "0" + rDark;
  }

  return [r, rDark];
}

/**
 * Get rand color
 *
 * @param {number} from Min color number
 * @param {number} to Max color number
 *
 * @returns {string} Color bytes in string
 */
function getRandColor(from, to) {
  let r = getRandHex(from, to),
    g = getRandHex(from, to),
    b = getRandHex(from, to);

  return ["#" + r[0] + g[0] + b[0], "#" + r[1] + g[1] + b[1]];
}

export class Color {
  /**
   * constructor
   */
  constructor() {
    this.assignedColors = {};
  }

  /**
   * Get one color
   *
   * @returns {string} Color code
   *
   */
  get() {
    const maxTries = 10;
    let tried = 0;

    for (;;) {
      let color = getRandColor(0x22, 0x33);

      if (this.assignedColors[color[0]]) {
        tried++;

        if (tried < maxTries) {
          continue;
        }
      }

      this.assignedColors[color[0]] = true;

      return {
        color: color[0],
        dark: color[1]
      };
    }
  }

  /**
   * forget already assigned color
   *
   * @param {string} color Color code
   */
  forget(color) {
    delete this.assignedColors[color];
  }
}
