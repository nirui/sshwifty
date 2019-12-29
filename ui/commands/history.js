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

import * as command from "./commands.js";

export class History {
  /**
   * constructor
   *
   * @param {array<object>} records
   * @param {function} saver
   * @param {number} maxItems
   *
   */
  constructor(records, saver, maxItems) {
    this.records = records;
    this.maxItems = maxItems;
    this.saver = saver;
  }

  /**
   * Save record to history
   *
   * @param {string} uname unique name
   * @param {string} title Title
   * @param {command.Info} info Command info
   * @param {Date} lastUsed Last used
   * @param {object} data Data
   * @param {object} sessionData Data which only available for current session
   *
   */
  save(uname, title, lastUsed, info, data, sessionData) {
    for (let i in this.records) {
      if (this.records[i].uname !== uname) {
        continue;
      }

      this.records.splice(i, 1);
      break;
    }

    this.records.push({
      uname: uname,
      title: title,
      type: info.name(),
      color: info.color(),
      last: lastUsed.getTime(),
      data: data,
      session: sessionData
    });

    if (this.records.length > this.maxItems) {
      this.records = this.records.slice(
        this.records.length - this.maxItems,
        this.records.length
      );
    }

    this.store();
  }

  /**
   * Save current records to storage
   *
   */
  store() {
    let r = [];

    for (let i in this.records) {
      r.push({
        uname: this.records[i].uname,
        title: this.records[i].title,
        type: this.records[i].type,
        color: this.records[i].color,
        last: this.records[i].last,
        data: this.records[i].data
      });
    }

    this.saver(this, r);
  }

  /**
   * Delete record from history
   *
   * @param {string} uid unique name
   *
   */
  del(uid) {
    for (let i in this.records) {
      if (this.records[i].uname !== uid) {
        continue;
      }

      this.records.splice(i, 1);
      break;
    }

    this.saver(this, this.records);
  }

  /**
   * Clear session data
   *
   * @param {string} uid unique name
   *
   */
  clearSession(uid) {
    for (let i in this.records) {
      if (this.records[i].uname !== uid) {
        continue;
      }

      this.records[i].session = null;
      break;
    }
  }

  /**
   * Return all history records
   *
   * @returns {array<object>} Records
   *
   */
  all() {
    let r = [];

    for (let i in this.records) {
      r.push({
        uid: this.records[i].uname,
        title: this.records[i].title,
        type: this.records[i].type,
        color: this.records[i].color,
        last: new Date(this.records[i].last),
        data: this.records[i].data,
        session: this.records[i].session
      });
    }

    return r;
  }
}
