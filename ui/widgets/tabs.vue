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
  <div :id="id">
    <tab-list
      :id="id + '-tabs'"
      :tab="tab"
      :tabs="tabs"
      :tabs-class="tabsClass"
      @current="$emit('current', $event)"
      @retap="$emit('retap', $event)"
      @close="$emit('close', $event)"
    ></tab-list>

    <a
      v-if="tabs.length > 0"
      :id="id + '-list'"
      :class="listTriggerClass"
      href="javascript:;"
      @click="showList"
    ></a>
  </div>
</template>

<script>
import TabList from "./tab_list.vue";

/**
 * @fileoverview Inline tab-bar wrapper that combines a `tab-list` with a
 * "show full list" trigger link. Used in the main application toolbar to
 * display open connection tabs. When the tab count exceeds what the bar can
 * show, the user can click the trigger to open the `tab_window.vue` overlay.
 *
 * @prop {string} id               - HTML id for the root `<div>` and derived child ids.
 * @prop {number} tab              - Index of the currently active tab.
 * @prop {Array}  tabs             - Array of tab descriptors.
 * @prop {string} tabsClass        - CSS class forwarded to the tab list.
 * @prop {string} listTriggerClass - CSS class applied to the "show full list" anchor.
 *
 * @emits current - Forwarded from tab-list; payload: `{number}` new active index.
 * @emits retap   - Forwarded from tab-list; payload: `{number}` index.
 * @emits close   - Forwarded from tab-list; payload: `{number}` index.
 * @emits list    - User clicked the trigger; payload: the full `tabs` array.
 */

export default {
  components: {
    "tab-list": TabList,
  },
  props: {
    id: {
      type: String,
      default: "",
    },
    tab: {
      type: Number,
      default: -1,
    },
    tabs: {
      type: Array,
      default: () => [],
    },
    tabsClass: {
      type: String,
      default: "",
    },
    listTriggerClass: {
      type: String,
      default: "",
    },
  },
  methods: {
    /**
     * Emits the `list` event with the current tabs array, signalling the parent
     * to open the full-list overlay (`tab_window.vue`).
     *
     * @emits list - Payload: `{Array}` the current tabs array.
     * @returns {void}
     */
    showList() {
      this.$emit("list", this.tabs);
    },
  },
};
</script>
