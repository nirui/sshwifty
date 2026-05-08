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
 * @file home_historyctl.js
 * @description Factory for the connection history controller used by the
 * `home` Vue component. Persists known remotes to `localStorage` under the
 * `"sshwifty-knowns"` key and migrates the legacy `"knowns"` key on first run.
 */

import { History } from "./commands/history.js";

/**
 * Builds and returns a {@link History} instance backed by `localStorage`.
 *
 * Performs a one-time migration of the legacy `"knowns"` key to
 * `"sshwifty-knowns"` (see inline TODO). Loads the existing record set, then
 * wires a save callback that serialises the history to JSON and syncs the
 * `connector.knowns` reactive property whenever the history changes.
 *
 * @param {{ connector: { knowns: Array } }} ctx - The home component instance,
 *   used to keep `connector.knowns` in sync with the persisted history.
 * @returns {History} The initialised history instance with up to 64 entries.
 */
export function build(ctx) {
  let rec = [];

  // This renames "knowns" to "sshwifty-knowns"
  // TODO: Remove this after some few years
  try {
    let oldStore = localStorage.getItem("knowns");

    if (oldStore) {
      localStorage.setItem("sshwifty-knowns", oldStore);
      localStorage.removeItem("knowns");
    }
  } catch (e) {
    // Do nothing
  }

  try {
    rec = JSON.parse(localStorage.getItem("sshwifty-knowns"));

    if (!rec) {
      rec = [];
    }
  } catch (e) {
    alert("Unable to load data of Known remotes: " + e);
  }

  return new History(
    rec,
    (h, d) => {
      try {
        localStorage.setItem("sshwifty-knowns", JSON.stringify(d));
        ctx.connector.knowns = h.all();
      } catch (e) {
        alert("Unable to save remote history due to error: " + e);
      }
    },
    64,
  );
}
