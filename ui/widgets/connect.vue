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
  <window
    id="connect"
    flash-class="home-window-display"
    :display="display"
    @display="$emit('display', $event)"
  >
    <div id="connect-frame">
      <h1 class="window-title">Establish connection with</h1>

      <slot v-if="inputting"></slot>

      <connect-switch
        v-if="!inputting"
        :knowns-length="knowns.length"
        :tab="tab"
        @switch="switchTab"
      ></connect-switch>

      <connect-new
        v-if="tab === 'new' && !inputting"
        :connectors="connectors"
        @select="selectConnector"
      ></connect-new>

      <connect-known
        v-if="tab === 'known' && !inputting"
        :presets="presets"
        :restricted-to-presets="restrictedToPresets"
        :knowns="knowns"
        :launcher-builder="knownsLauncherBuilder"
        :knowns-export="knownsExport"
        :knowns-import="knownsImport"
        @select="selectKnown"
        @select-preset="selectPreset"
        @remove="removeKnown"
        @clear-session="clearSessionKnown"
      ></connect-known>

      <div id="connect-warning">
        <span id="connect-warning-icon" class="icon icon-warning1"></span>
        <div id="connect-warning-msg">
          <p>
            <strong>An insecured service may steal your secrets.</strong>
            Always exam the safety of the service before using it.
          </p>

          <p>
            Sshwifty is a free software, you can deploy it on your own trusted
            infrastructure.
            <a href="https://github.com/Snuffy2/sshwifty" target="_blank"
              >Learn more</a
            >
          </p>
        </div>
      </div>

      <div v-if="busy" id="connect-busy-overlay"></div>
    </div>
  </window>
</template>

<script>
import "./connect.css";

/**
 * @fileoverview Root connection-establishment widget. Composes the new-remote
 * picker, the known-remotes list, and the tab-switch control into a single
 * overlay window. Delegates connector selection and known-host management
 * upward via emitted events so the parent can drive the wizard flow.
 *
 * @prop {boolean}  display             - Controls overlay visibility.
 * @prop {boolean}  inputting           - When true, hides list panels and
 *   shows a slotted content (e.g. the wizard fieldset) instead.
 * @prop {Array}    presets             - Server-defined preset connections.
 * @prop {boolean}  restrictedToPresets - Hides "New remote" when true.
 * @prop {Array}    knowns              - Previously connected remotes.
 * @prop {Function} knownsLauncherBuilder - Builds a shareable launch URL for a known.
 * @prop {Function} knownsExport        - Serialises knowns to exportable data.
 * @prop {Function} knownsImport        - Deserialises and merges imported data.
 * @prop {Array}    connectors          - Available connector types (SSH, Telnet…).
 * @prop {boolean}  busy                - When true, overlays the panel to block interaction.
 *
 * @emits display           - Forwarded from the window widget; payload: `{boolean}`.
 * @emits connector-select  - User chose a new connector type. Payload: connector object.
 * @emits known-select      - User clicked a known remote. Payload: known object.
 * @emits known-remove      - User removed a known remote. Payload: `{string}` uid.
 * @emits preset-select     - User selected a preset. Payload: preset object.
 * @emits known-clear-session - User cleared session data for a known. Payload: `{string}` uid.
 */

import Window from "./window.vue";
import ConnectSwitch from "./connect_switch.vue";
import ConnectKnown from "./connect_known.vue";
import ConnectNew from "./connect_new.vue";

export default {
  components: {
    window: Window,
    "connect-switch": ConnectSwitch,
    "connect-known": ConnectKnown,
    "connect-new": ConnectNew,
  },
  props: {
    display: {
      type: Boolean,
      default: false,
    },
    inputting: {
      type: Boolean,
      default: false,
    },
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
    knownsLauncherBuilder: {
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
    connectors: {
      type: Array,
      default: () => [],
    },
    busy: {
      type: Boolean,
      default: false,
    },
  },
  /**
   * @returns {{tab: string, canSelect: boolean}}
   *   `tab` — active panel: `"new"` or `"known"`.
   *   `canSelect` — reserved flag for future debounce logic.
   */
  data() {
    return {
      tab: !this.restrictedToPresets ? "new" : "known",
      canSelect: true,
    };
  },
  methods: {
    /**
     * Switches the active panel tab. No-op while the wizard is `inputting`.
     *
     * @param {string} to - Target tab name: `"new"` or `"known"`.
     * @returns {void}
     */
    switchTab(to) {
      if (this.inputting) {
        return;
      }

      this.tab = to;
    },
    /**
     * Emits `connector-select` with the chosen connector. No-op while `inputting`.
     *
     * @param {Object} connector - The connector descriptor chosen by the user.
     * @emits connector-select
     * @returns {void}
     */
    selectConnector(connector) {
      if (this.inputting) {
        return;
      }

      this.$emit("connector-select", connector);
    },
    /**
     * Emits `known-select` with the chosen known-remote. No-op while `inputting`.
     *
     * @param {Object} known - The known-remote descriptor chosen by the user.
     * @emits known-select
     * @returns {void}
     */
    selectKnown(known) {
      if (this.inputting) {
        return;
      }

      this.$emit("known-select", known);
    },
    /**
     * Emits `known-remove` for the given uid. No-op while `inputting`.
     *
     * @param {string} uid - Unique identifier of the known remote to remove.
     * @emits known-remove
     * @returns {void}
     */
    removeKnown(uid) {
      if (this.inputting) {
        return;
      }

      this.$emit("known-remove", uid);
    },
    /**
     * Emits `preset-select` with the chosen preset. No-op while `inputting`.
     *
     * @param {Object} preset - The preset descriptor chosen by the user.
     * @emits preset-select
     * @returns {void}
     */
    selectPreset(preset) {
      if (this.inputting) {
        return;
      }

      this.$emit("preset-select", preset);
    },
    /**
     * Emits `known-clear-session` for the given uid. No-op while `inputting`.
     *
     * @param {string} uid - Unique identifier of the known remote whose session to clear.
     * @emits known-clear-session
     * @returns {void}
     */
    clearSessionKnown(uid) {
      if (this.inputting) {
        return;
      }

      this.$emit("known-clear-session", uid);
    },
  },
};
</script>
