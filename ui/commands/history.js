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

function metaContains(data, metaName, valContains) {
  switch (typeof data[metaName]) {
    case "string":
      return data[metaName].indexOf(valContains) >= 0;

    default:
      return false;
  }
}

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
   * Return the index of given uname, or -1 when not found
   *
   * @param {string} uname the unique name
   *
   * @returns {integer} The index of given uname
   *
   */
  indexOf(uname) {
    for (let i in this.records) {
      if (this.records[i].uname !== uname) {
        continue;
      }

      return i;
    }

    return -1;
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
    const unameIdx = this.indexOf(uname);

    if (unameIdx >= 0) {
      this.records.splice(unameIdx, 1);
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
    this.saver(this, this.export());
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
   * Return all history records. The exported data is differ than the
   * internal ones, it cannot be directly import back
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

  /**
   * Export current history records
   *
   * @returns {array<object>} Records
   *
   */
  export() {
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

    return r;
  }

  /**
   * Import data into current history records
   *
   * @param {array<object>} records Records
   *
   */
  import(records) {
    for (let i in records) {
      if (this.indexOf(records[i].uname) >= 0) {
        continue;
      }

      this.records.push({
        uname: records[i].uname,
        title: records[i].title,
        type: records[i].type,
        color: records[i].color,
        last: records[i].last,
        data: records[i].data
      });
    }

    this.store();
  }

  /**
   * Search for partly matched results
   *
   * @param {string} type of the history record
   * @param {string} metaName name of the meta data
   * @param {string} keyword keyword to search
   * @param {number} max max results
   */
  search(type, metaName, keyword, max) {
    let maxResults = max > this.records.length ? this.records.length : max;
    let s = [];

    if (maxResults < 0) {
      maxResults = this.records.length;
    }

    for (let i = 0; i < this.records.length && s.length < maxResults; i++) {
      if (this.records[i].type !== type) {
        continue;
      }

      if (!this.records[i].data) {
        continue;
      }

      if (!metaContains(this.records[i].data, metaName, keyword)) {
        continue;
      }

      s.push(this.records[i]);
    }

    return s;
  }
}
