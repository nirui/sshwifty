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
 * @file Tab-color management for Sshwifty command sessions.
 *
 * Provides {@link RGB} for raw color values, {@link Color} for a static custom
 * color, {@link DispensedColor} for a randomly allocated color that can be
 * returned to the pool, and {@link Colors} as the pool manager that dispenses
 * and reclaims colors to keep concurrent session tabs visually distinct.
 */

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

/**
 * Immutable RGB color value.
 *
 * Stores red, green, and blue channel values as numbers (0–255) and can
 * render them as a CSS hex string via {@link RGB#hex}.
 */
export class RGB {
  /**
   * constructor
   *
   * @param {number} r value of Red channel (0–255)
   * @param {number} g value of Green channel (0–255)
   * @param {number} b value of Blue channel (0–255)
   *
   */
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  /**
   * Return the color as a CSS hex string.
   *
   * @returns {string} Six-character hex color prefixed with `#` (e.g. `#1a2b3c`).
   */
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

/**
 * A static (non-pooled) color created from a user-supplied hex value.
 *
 * Unlike {@link DispensedColor}, forgetting a `Color` is a no-op because it
 * was never allocated from the shared pool.
 */
export class Color {
  /**
   * constructor
   *
   * @param {RGB} color The RGB value for this color.
   *
   */
  constructor(color) {
    this.color = color;
  }

  /**
   * Return the CSS hex string for this color.
   *
   * @returns {string} Hex color string (e.g. `#1a2b3c`).
   */
  hex() {
    return this.color.hex();
  }

  /**
   * No-op. Static colors are not pooled and need no reclamation.
   */
  forget() {}
}

/**
 * A randomly allocated color leased from the {@link Colors} pool.
 *
 * Call {@link DispensedColor#forget} when the session ends to return the color
 * to the pool so it can be reused by future sessions.
 */
export class DispensedColor {
  /**
   * constructor
   *
   * @param {RGB} color The allocated RGB color.
   * @param {Colors} returner The pool manager that allocated this color.
   *
   */
  constructor(color, returner) {
    this.color = color;
    this.returner = returner;
  }

  /**
   * Return the CSS hex string for this color.
   *
   * @returns {string} Hex color string (e.g. `#1a2b3c`).
   */
  hex() {
    return this.color.hex();
  }

  /**
   * Return this color to the pool so it can be dispensed again.
   */
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

/**
 * Pool manager for session tab colors.
 *
 * Tracks which hex color values are currently in use and tries to avoid
 * assigning duplicates. Colors are drawn from a narrow dark range so they
 * contrast with foreground text without being visually overwhelming.
 */
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
   * Return a previously dispensed color to the pool so it can be reused.
   *
   * @param {DispensedColor} color The dispensed color to release.
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
