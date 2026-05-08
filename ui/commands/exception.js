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
 * @file Command-layer exception type. A thin Error subclass used consistently
 * across all command modules to signal domain-level failures (bad input,
 * undefined presets, invalid field values, etc.).
 */

/**
 * Command-layer error.
 *
 * Thrown by command builders, field validators, preset parsers, and address
 * parsers to signal invalid state or input. Callers can distinguish it from
 * unexpected runtime errors by checking `instanceof Exception`.
 */
export default class Exception extends Error {
  /**
   * constructor
   *
   * @param {string} message error message
   *
   */
  constructor(message) {
    super(message);
  }
}
