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
  <ul id="connect-switch" class="tab2" :class="{ red: tab === 'known' }">
    <li :class="{ active: tab === 'new' }" @click="switchTab('new')">
      New remote
    </li>

    <li :class="{ active: tab === 'known' }" @click="switchTab('known')">
      Known remotes <span class="label">{{ knownsLength }}</span>
    </li>
  </ul>
</template>

<script>
import "./connect_switch.css";

/**
 * @fileoverview Tab-bar component that switches the connect panel between the
 * "New remote" and "Known remotes" views. Renders as a two-item `<ul>` and
 * shows the count of known remotes as a badge on the second tab.
 *
 * @prop {string} tab          - Currently active tab: `"new"` or `"known"`.
 * @prop {number} knownsLength - Number of known remotes to display in the badge.
 *
 * @emits switch - User clicked a tab. Payload: `{string}` the target tab name.
 */

export default {
  props: {
    tab: {
      type: String,
      default: "new",
    },
    knownsLength: {
      type: Number,
      default: 0,
    },
  },
  methods: {
    /**
     * Emits the `switch` event with the target tab name.
     *
     * @param {string} to - The tab to switch to: `"new"` or `"known"`.
     * @emits switch
     * @returns {void}
     */
    switchTab(to) {
      this.$emit("switch", to);
    },
  },
};
</script>
