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

/**
 * Get one unsafe random number
 *
 * @param {number} min Min value (included)
 * @param {number} max Max value (not included)
 *
 * @returns {number} Get random number
 *
 */
export function getRand(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Get a group of random number
 *
 * @param {number} n How many number to get
 * @param {number} min Min value (included)
 * @param {number} max Max value (not included)
 *
 * @returns {Array<number>} A group of random number
 */
export function getRands(n, min, max) {
  let r = [];

  for (let i = 0; i < n; i++) {
    r.push(getRand(min, max));
  }

  return r;
}
