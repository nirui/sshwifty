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

export class Records {
  /**
   * constructor
   *
   * @param {array} data Data space
   */
  constructor(data) {
    this.data = data;
  }

  /**
   * Insert new item into the history records
   *
   * @param {number} newData New value
   */
  update(newData) {
    this.data.shift();
    this.data.push({ data: newData, class: "" });
  }

  /**
   * Set all existing data as expired
   */
  expire() {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i].class = "expired";
    }
  }

  /**
   * Return data
   *
   */
  get() {
    return this.data;
  }
}
