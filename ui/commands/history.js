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

import * as command from "./commands.js";

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
 * constructor
 *
 * @param {object} data to be searched
 * @param {string} metaName name of the meta
 * @param {string} valContains target string to search
 *
 */
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
   * @param {Array<object>} records
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
    this.store();
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

/**
 * Check if current user is effected by the Secret Data Mis Stored Bug
 *
 * @param {History} h
 *
 * @returns {Array<string>} the title of records effected by the bug
 */
function effectedBySecretDataStoredBug(h) {
  const memRecord = h.all();
  let effected = [];
  for (let i in memRecord) {
    if (!memRecord[i]["session"]) {
      // No secret saved
      continue;
    }
    if (!memRecord[i]["keptSessions"]) {
      // No secret should be saved?
      return true;
    }
    const totalSessionSaved = Object.keys(memRecord[i].session).length;
    let intendedStoredSessionData = 0;
    for (let k in memRecord[i].keptSessions) {
      if (typeof memRecord[i].session[k] === "undefined") {
        continue;
      }
      intendedStoredSessionData++;
    }
    if (totalSessionSaved === intendedStoredSessionData) {
      continue;
    }
    effected.push(memRecord[i].title);
  }
  return effected;
}

const isEffectedBySecretDataStoredBugMessage = `<div class="version-warning">
<div class="version-message">
  <p>
    You're effected by a bug in the previous versions of Sshwifty that
    unintentionally <b>stored your SSH logins such as passwords and/or private
    keys</b> to your browser's local data storage.
  </p>

  <p>
    The effected record(s) are: <b>%effectedRecords%</b>
  </p>

  <p>
    An automated process should have already removed the secrets from the
    effected records. But based on the security of your browser, <b>it is
    recommended to secure of these servers by changing your logins</b>. Sorry
    for the inconvenience.
  </p>

  <p>
    This message disappears if you reload the page.
  </p>
</div>
</div>`;
const notEffectedBySecretDataStoredBugMessage = `<div class="version-info">
<div class="version-message">
  <details>
    <summary>
      There was a bug in the previous versions of Sshwifty that could
      <b>unintentionally store your SSH logins</b> into your browser's local
      storage. <u>Click here</u> to learn more.
    </summary>

    <hr />

    <p>
      In the previous versions of Sshwifty, a bug could allow SSH logins, which
      is considered user secret by Sshwifty and should never be stored, to
      be saved in your browser's local data storage.
    </p>

    <p>
      The bug is triggered when user deletes a remote from their "Connected
      before" list while the SSH login data from other remote(s) remain loaded
      in the browser's runtime memory (observable if the remote item shows
      "Clear" rather than "Remove" when hovering pointer over it).
    </p>

    <p>
      The remote deletion process failed to sanitize these login data before
      storing the remote login history to your browser, causing the data leak.
    </p>

    <p>
      Sshwifty has scanned your current remote records and founds no leaked
      data. But still, if you've ever triggered the bug and this browser is
      insecure (for example, it's installed on a shared computer or have an
      insecure browser plugin), please consider to change your SSH logins just
      be safe.
    </p>

    <p>
      I'm so sorry for the inconvenience.
    </p>
  </details>
</div>
</div>`;

/**
 * Generates the warning message for the bug that caused user secret data been
 * saved to the history record
 *
 * Note: keep this feature for at least until May 2027 (6 month)
 *
 * @param {History} h
 *
 * @returns {string} the warning message in HTML format
 */
export function generateSecretDataStoreBugWarningMessage(h) {
  const effectedRecords = effectedBySecretDataStoredBug(h);
  if (effectedRecords.length > 0) {
    h.store();
    return isEffectedBySecretDataStoredBugMessage.replaceAll(
      "%effectedRecords%",
      effectedRecords
        .join(", ")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;"),
    );
  }
  return notEffectedBySecretDataStoredBugMessage;
}
