<!--
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
-->

<template>
  <div id="connect-known-list" :class="{ reloaded: reloaded }">
    <div
      v-if="knownList.length <= 0 && presets <= 0"
      id="connect-known-list-empty"
    >
      No known remote available
    </div>
    <div v-else>
      <div v-if="knownList.length > 0" id="connect-known-list-list">
        <h3>Connected before</h3>

        <ul class="hlst lstcl1">
          <li v-for="(known, kk) in knownList" :key="kk">
            <div class="labels">
              <span
                class="type"
                :style="'background-color: ' + known.data.color"
              >
                {{ known.data.type }}
              </span>

              <a
                class="opt link"
                href="javascript:;"
                @click="launcher(known, $event)"
              >
                {{ known.copyStatus }}
              </a>

              <a
                v-if="!known.data.session"
                class="opt del"
                href="javascript:;"
                @click="remove(known.data.uid)"
              >
                Remove
              </a>
              <a
                v-else
                class="opt clr"
                href="javascript:;"
                title="Clear session data"
                @click="clearSession(known.data.uid)"
              >
                Clear
              </a>
            </div>

            <div class="lst-wrap" @click="select(known.data)">
              <h4
                :title="known.data.title"
                :class="{ highlight: known.data.session }"
              >
                {{ known.data.title }}
              </h4>
              Last: {{ known.data.last.toLocaleString() }}
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="presets.length > 0"
        id="connect-known-list-presets"
        :class="{
          'last-planel': knownList.length > 0,
        }"
      >
        <h3>Presets</h3>

        <ul class="hlst lstcl2">
          <li
            v-for="(preset, pk) in presets"
            :key="pk"
            :class="{ disabled: presetDisabled(preset) }"
          >
            <div class="lst-wrap" @click="selectPreset(preset)">
              <div class="labels">
                <span
                  class="type"
                  :style="'background-color: ' + preset.command.color()"
                >
                  {{ preset.command.name() }}
                </span>
              </div>

              <h4 :title="preset.preset.title()">
                {{ preset.preset.title() }}
              </h4>
            </div>
          </li>
        </ul>

        <div v-if="restrictedToPresets" id="connect-known-list-presets-alert">
          The operator has restricted the outgoing connections. You can only
          connect to remotes from the pre-defined presets.
        </div>
      </div>
    </div>

    <div id="connect-known-list-import">
      Tip: You can
      <a href="javascript:;" @click="importHosts">import</a> and
      <a href="javascript:;" @click="exportHosts">export</a>
      known remotes from and to a file.
    </div>
  </div>
</template>

<script>
import "./connect_known.css";

/**
 * @fileoverview Lists previously connected remotes and server-defined presets,
 * and provides import/export functionality for the known-remotes store.
 *
 * The component accepts the raw `knowns` array from the parent, converts it
 * into an internal list with copy-link state, and plays a brief CSS animation
 * when entries are added. Preset entries can be disabled when
 * `restrictedToPresets` is true and the preset lacks a host.
 *
 * @prop {Array}    presets             - Server-defined preset connections.
 * @prop {boolean}  restrictedToPresets - When true, only fully-specified presets are selectable.
 * @prop {Array}    knowns              - Previously connected remote descriptors.
 * @prop {Function} launcherBuilder     - Builds a shareable URL for a known remote.
 * @prop {Function} knownsExport        - Returns the serialisable known-remotes payload.
 * @prop {Function} knownsImport        - Merges a deserialised known-remotes payload.
 *
 * @emits select         - User chose a known remote. Payload: known data object.
 * @emits select-preset  - User chose a preset. Payload: preset object.
 * @emits remove         - User removed a known remote. Payload: `{string}` uid.
 * @emits clear-session  - User cleared session data. Payload: `{string}` uid.
 */

export default {
  props: {
    presets: {
      type: Array,
      default: () => [],
    },
    restrictedToPresets: {
      type: Boolean,
      default: () => false,
    },
    knowns: {
      type: Array,
      default: () => [],
    },
    launcherBuilder: {
      type: Function,
      default: () => [],
    },
    knownsExport: {
      type: Function,
      default: () => [],
    },
    knownsImport: {
      type: Function,
      default: () => [],
    },
  },
  /**
   * @returns {{knownList: Array, reloaded: boolean, busy: boolean}}
   *   `knownList` — internal copy of knowns in reverse insertion order with copy-link state.
   *   `reloaded` — briefly true after the list grows, triggering a CSS reload animation.
   *   `busy` — true while an async clipboard or file operation is in progress.
   */
  data() {
    return {
      knownList: [],
      reloaded: false,
      busy: false,
    };
  },
  watch: {
    knowns(newVal) {
      // Only play reload animation when we're adding data into the records,
      // not reducing
      const playReloaded = newVal.length > this.knownList.length;

      this.reload(newVal);

      if (!playReloaded) {
        return;
      }

      const self = this;

      self.reloaded = true;
      setTimeout(() => {
        self.reloaded = false;
      }, 500);
    },
  },
  mounted() {
    this.reload(this.knowns);
  },
  methods: {
    /**
     * Rebuilds the internal `knownList` from the raw knowns array, reversing
     * the order so the most-recent connection appears first, and resets each
     * entry's copy-link state.
     *
     * @param {Array} knownList - The updated knowns array from the parent.
     * @returns {void}
     */
    reload(knownList) {
      this.knownList = [];

      for (let i in knownList) {
        this.knownList.unshift({
          data: knownList[i],
          copying: false,
          copyStatus: "Copy link",
        });
      }
    },
    /**
     * Emits `select` with the known-remote data object.
     * No-op while a clipboard or file operation is in progress.
     *
     * @param {Object} known - The known remote data object.
     * @emits select
     * @returns {void}
     */
    select(known) {
      if (this.busy) {
        return;
      }

      this.$emit("select", known);
    },
    /**
     * Returns whether a preset should be rendered as non-interactive.
     *
     * A preset is disabled when `restrictedToPresets` is true and the preset
     * does not specify a host (i.e. requires the user to fill in the address).
     *
     * @param {Object} preset - The preset descriptor.
     * @returns {boolean} True if the preset should be disabled.
     */
    presetDisabled(preset) {
      if (!this.restrictedToPresets || preset.preset.host().length > 0) {
        return false;
      }

      return true;
    },
    /**
     * Emits `select-preset` with the chosen preset.
     * No-op while busy or if the preset is disabled.
     *
     * @param {Object} preset - The preset descriptor chosen by the user.
     * @emits select-preset
     * @returns {void}
     */
    selectPreset(preset) {
      if (this.busy || this.presetDisabled(preset)) {
        return;
      }

      this.$emit("select-preset", preset);
    },
    /**
     * Builds a launch URL for the known remote and copies it to the clipboard.
     *
     * Shows intermediate "Copying" / "Copied!" / "Failed" states on the button.
     * Falls back to setting the anchor `href` so the user can still follow the
     * link manually if clipboard access is denied. Resets the label after 2 s.
     *
     * @param {{data: Object, copying: boolean, copyStatus: string}} known - Internal known-list entry.
     * @param {MouseEvent} ev - The originating click event (used to update href on failure).
     * @returns {Promise<void>}
     */
    async launcher(known, ev) {
      if (known.copying || this.busy) {
        return;
      }

      ev.preventDefault();

      this.busy = true;
      this.$set(known, "copying", true);
      this.$set(known, "copyStatus", "Copying");

      let lnk = this.launcherBuilder(known.data);

      try {
        await navigator.clipboard.writeText(lnk);

        (() => {
          this.$set(known, "copyStatus", "Copied!");
        })();
      } catch (e) {
        (() => {
          this.$set(known, "copyStatus", "Failed");
          ev.target.setAttribute("href", lnk);
        })();
      }

      setTimeout(() => {
        this.$set(known, "copyStatus", "Copy link");
        this.$set(known, "copying", false);
      }, 2000);

      this.busy = false;
    },
    /**
     * Emits `remove` with the uid of the known remote to delete.
     * No-op while busy.
     *
     * @param {string} uid - Unique identifier of the known remote to remove.
     * @emits remove
     * @returns {void}
     */
    remove(uid) {
      if (this.busy) {
        return;
      }

      this.$emit("remove", uid);
    },
    /**
     * Emits `clear-session` with the uid of the known remote whose persisted
     * session data should be cleared. No-op while busy.
     *
     * @param {string} uid - Unique identifier of the known remote.
     * @emits clear-session
     * @returns {void}
     */
    clearSession(uid) {
      if (this.busy) {
        return;
      }

      this.$emit("clear-session", uid);
    },
    /**
     * Serialises all known remotes to a base64-encoded JSON file and triggers a
     * browser download. Shows an alert if serialisation or download fails.
     *
     * @returns {void}
     */
    exportHosts() {
      let el = null;

      try {
        const dataStr = JSON.stringify(this.knownsExport());

        el = document.createElement("a");
        el.setAttribute(
          "href",
          "data:text/plain;charset=utf-8," + btoa(dataStr),
        );
        el.setAttribute("target", "_blank");
        el.setAttribute("download", "sshwifty.known-remotes.txt");
        el.setAttribute(
          "style",
          "overflow: hidden; opacity: 0; width: 1px; height: 1px; top: -1px;" +
            "left: -1px; position: absolute;",
        );

        document.body.appendChild(el);

        el.click();
      } catch (e) {
        alert("Unable to export known remotes: " + e);
      }

      if (el === null) {
        return;
      }

      document.body.removeChild(el);
    },
    /**
     * Opens a hidden `<input type="file">` picker and reads the selected file
     * as base64-encoded JSON, then delegates to `knownsImport` to merge the
     * entries. Shows an alert if file reading or parsing fails.
     *
     * @returns {void}
     */
    importHosts() {
      const self = this;

      let el = null;

      try {
        el = document.createElement("input");
        el.setAttribute("type", "file");
        el.setAttribute(
          "style",
          "overflow: hidden; opacity: 0; width: 1px; height: 1px; top: -1px;" +
            "left: -1px; position: absolute;",
        );
        el.addEventListener("change", (ev) => {
          const t = ev.target;

          if (t.files.length <= 0) {
            return;
          }

          t.disabled = "disabled";

          let r = new FileReader();

          r.onload = () => {
            try {
              self.knownsImport(JSON.parse(atob(r.result)));
            } catch (e) {
              alert("Unable to import known remotes due to error: " + e);
            }
          };

          r.readAsText(t.files[0], "utf-8");
        });

        document.body.appendChild(el);

        el.click();
      } catch (e) {
        alert("Unable to load known remotes data due to error: " + e);
      }

      if (el === null) {
        return;
      }

      document.body.removeChild(el);
    },
  },
};
</script>
