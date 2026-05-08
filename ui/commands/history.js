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
 * @file Connection history manager for the Sshwifty UI.
 *
 * {@link History} stores, retrieves, and searches past connection records
 * (host, credentials, session data). Records are persisted via a caller-
 * supplied `saver` callback and are capped at `maxItems` entries.
 */

/**
 * Extract needed data
 *
 * @param {Array<string>} kept The keys of of the data to be kept
 * @param {object} input Input data
 *
 * @return {object} Extracted data
 */
function extractSelectedData(kept, input) {
  if (!kept || typeof kept !== "object" || kept.length < 0) {
    return null;
  }

  let data = {},
    length = 0;

  for (let k in kept) {
    if (!input[kept[k]]) {
      continue;
    }

    data[kept[k]] = input[kept[k]];
    length++;
  }

  if (length <= 0) {
    return null;
  }

  return data;
}

/**
 * Return whether a named string field within `data` contains `valContains`
 * as a substring. Non-string fields always return `false`.
 *
 * @private
 * @param {object} data Record data object to inspect.
 * @param {string} metaName Name of the field within `data`.
 * @param {string} valContains Substring to search for.
 * @returns {boolean} `true` when the field is a string and contains the
 *   target substring.
 */
function metaContains(data, metaName, valContains) {
  switch (typeof data[metaName]) {
    case "string":
      return data[metaName].indexOf(valContains) >= 0;

    default:
      return false;
  }
}

/**
 * Manages connection history records across sessions.
 *
 * Records are stored as plain objects and optionally serialized by a
 * caller-supplied `saver` function (e.g. writing to `localStorage`). The list
 * is ordered by recency and pruned to `maxItems` on every save.
 */
export class History {
  /**
   * constructor
   *
   * @param {Array<object>} records Initial history records (may be empty).
   * @param {function} saver Called with `(history, exportedRecords)` whenever
   *   the record list changes.
   * @param {number} maxItems Maximum number of records to retain.
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
   * @param {Array<string>} keptSessions Keys of the session data that should
   *                                     be saved
   *
   */
  save(uname, title, lastUsed, info, data, sessionData, keptSessions) {
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
      session: sessionData,
      keptSessions: keptSessions,
    });

    if (this.records.length > this.maxItems) {
      this.records = this.records.slice(
        this.records.length - this.maxItems,
        this.records.length,
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
      this.records[i].keptSessions = [];
      break;
    }

    this.store();
  }

  /**
   * Return all history records. The exported data is differ than the
   * internal ones, it cannot be directly import back
   *
   * @returns {Array<object>} Records
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
        session: this.records[i].session,
        keptSessions: this.records[i].keptSessions,
      });
    }

    return r;
  }

  /**
   * Export current history records
   *
   * @returns {Array<object>} Records
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
        data: this.records[i].data,
        session: extractSelectedData(
          this.records[i].keptSessions,
          this.records[i].session,
        ),
        keptSessions: this.records[i].keptSessions,
      });
    }

    return r;
  }

  /**
   * Import data into current history records
   *
   * @param {Array<object>} records Records
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
        data: records[i].data,
        session: extractSelectedData(
          records[i].keptSessions,
          records[i].session,
        ),
        keptSessions: records[i].keptSessions,
      });
    }

    this.store();
  }

  /**
   * Search history records for entries whose type matches and whose named
   * data field contains the keyword as a substring.
   *
   * @param {string} type Command type string to filter by (e.g. `"SSH"`).
   * @param {string} metaName Name of the data field to search within.
   * @param {string} keyword Substring to look for in the data field.
   * @param {number} max Maximum number of results to return; pass `-1` for all.
   * @returns {Array<object>} Matching history records (raw internal format).
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
