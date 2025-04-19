// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2025 Ni Rui <ranqus@gmail.com>
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
 * Converts color number to a hex string
 *
 * @param {number} num color value
 *
 * @return {string} the hex of given `color`
 *
 */
function numToHex(num) {
  let r = Math.round(num).toString(16);
  if (r.length % 2 === 0) {
    return r;
  }
  return "0" + r;
}

/**
 * Converts hex string to a color number
 *
 * @param {string} hex string
 *
 * @return {number} number of the color
 *
 */
function hexToNum(hex) {
  return Math.round(parseInt(hex, 16));
}

const VALID_HEX_REGEXP = `^([a-f0-9]+)$`;

/**
 * Make given hex a valid RGB color hex
 *
 * @param {string} hex string
 *
 * @return {string} valid color hex
 *
 */
function makeValidHex(hex) {
  if (!hex.toLowerCase().match(VALID_HEX_REGEXP)) {
    return "";
  }
  switch (hex.length) {
    case 6:
      return hex;
    case 5:
      // AABBC => AABBCC
      return hex + hex[4];
    case 4:
      // AABC => AABBCC
      return hex[0] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    case 3:
      // ABC => AABBCC
      return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    case 2:
      // AB => AABBBB
      return hex[0] + hex[0] + hex[1] + hex[1] + hex[1] + hex[1];
    case 1:
      // A => AAAAAA
      return hex[0] + hex[0] + hex[0] + hex[0] + hex[0] + hex[0];
    case 0:
      return "";
    default:
      return hex.slice(0, 6);
  }
}

export class RGB {
  /**
   * constructor
   *
   * @param {number} r value of Red channel
   * @param {number} g value of Green channel
   * @param {number} b value of Blue channel
   *
   */
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  hex() {
    return "#" + numToHex(this.r) + numToHex(this.g) + numToHex(this.b);
  }
}

/**
 * Get one random number
 *
 * @param {number} from at this this value
 * @param {number} to at most this value
 *
 */
function getRandNumber(from, to) {
  return from + Math.random() * (to - from);
}

/**
 * Get rand color
 *
 * @param {number} from Min color number
 * @param {number} to Max color number
 *
 * @returns {RGB} RGB color
 */
function getRandColor(from, to) {
  return new RGB(
    getRandNumber(from, to),
    getRandNumber(from, to),
    getRandNumber(from, to),
  );
}

export class Color {
  /**
   * constructor
   *
   * @param {RGB} color value of Red channel
   *
   */
  constructor(color) {
    this.color = color;
  }

  hex() {
    return this.color.hex();
  }

  forget() {}
}

export class DispensedColor {
  /**
   * constructor
   *
   * @param {RGB} color value of Red channel
   * @param {Colors} returner the color manager
   *
   */
  constructor(color, returner) {
    this.color = color;
    this.returner = returner;
  }

  hex() {
    return this.color.hex();
  }

  forget() {
    this.returner.forget(this);
  }
}

/**
 * The boundary of random colors
 *
 * @note don't use value that is too high which will dim the foreground text.
 * In fact, current boomer color range is already the best looking
 *
 */
const RAND_COLOR_MIN = 0x11; // 17
const RAND_COLOR_MAX = 0x22; // 34

export class Colors {
  /**
   * constructor
   */
  constructor() {
    this.assignedColors = {};
  }

  /**
   * Dispenses one color
   *
   * @returns {DispensedColor} Color code
   *
   */
  dispense() {
    const maxTries = 10;
    let tried = 0;
    for (;;) {
      let color = getRandColor(RAND_COLOR_MIN, RAND_COLOR_MAX);
      let colorKey = color.hex();
      if (this.assignedColors[colorKey]) {
        tried++;
        if (tried < maxTries) {
          continue;
        }
      }
      this.assignedColors[colorKey] = true;
      return new DispensedColor(color, this);
    }
  }

  /**
   * Forget the specified color so it can be dispensed again
   *
   * @param {RGB} color value of Red channel
   *
   */
  forget(color) {
    delete this.assignedColors[color.hex()];
  }

  /**
   * Dispense random color or creates one out of given customColorHex
   *
   * @param {string} customColorHex custom RGB color hex
   *
   * @returns {DispensedColor|Color} Color code
   *
   */
  get(customColorHex) {
    customColorHex = makeValidHex(customColorHex);
    if (customColorHex.length <= 0) {
      return this.dispense();
    }
    return new Color(
      new RGB(
        hexToNum(customColorHex[0] + customColorHex[1]),
        hexToNum(customColorHex[2] + customColorHex[3]),
        hexToNum(customColorHex[4] + customColorHex[5]),
      ),
    );
  }
}
