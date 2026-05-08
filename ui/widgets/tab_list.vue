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
  <ul :id="id" :class="tabsClass">
    <li
      v-for="(tabInfo, idx) in tabs"
      :key="tabInfo.id"
      :class="{
        active: tab === idx,
        error:
          tabInfo.indicator.message.length > 0 &&
          tabInfo.indicator.level === 'error',
        updated: tabInfo.indicator.updated && tab !== idx,
      }"
      :style="'background: ' + tabInfo.control.color()"
      @click.self="switchTab(idx)"
    >
      <span class="title" :title="tabInfo.name" @click="switchTab(idx)">
        <span
          class="type"
          :title="tabInfo.info.name()"
          :style="'background: ' + tabInfo.info.color()"
        >
          {{ tabInfo.info.name()[0] }}
        </span>
        {{ tabInfo.name }}
      </span>

      <span class="icon icon-close icon-close1" @click="closeAt(idx)"></span>
    </li>
  </ul>
</template>

<script>
/**
 * @fileoverview Renders a horizontal list of connection tabs. Each tab shows
 * the connection type badge, name, error/update indicator states, and a close
 * button. Handles tab switching (with a `retap` event for re-tapping the active
 * tab, e.g. to toggle the toolbar) and tab closure.
 *
 * Props changes to `tab` and `tabs` are watched to keep the active index valid
 * when tabs are added or removed.
 *
 * @prop {string} id          - HTML id applied to the root `<ul>` element.
 * @prop {number} tab         - Index of the currently active tab (-1 = none).
 * @prop {Array}  tabs        - Array of tab descriptors with `id`, `name`, `info`,
 *   `control`, and `indicator` fields.
 * @prop {string} tabsClass   - Additional CSS class applied to the root `<ul>`.
 *
 * @emits current - User switched to a different tab. Payload: `{number}` new index.
 * @emits retap   - User clicked the already-active tab. Payload: `{number}` index.
 * @emits close   - User clicked the close icon on a tab. Payload: `{number}` index.
 */

export default {
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
  },
  watch: {
    tab(newVal) {
      this.switchTabTo(newVal);
    },
    tabs(newVal) {
      if (newVal.length > this.tab) {
        return;
      }

      this.switchTabTo(newVal.length - 1);
    },
  },
  methods: {
    /**
     * Emits `current` to change the active tab, without a `retap` side-effect.
     *
     * Used internally by watchers to correct the active index when the tabs array
     * shrinks. No-op if `index` is out of range or already the active tab.
     *
     * @param {number} index - The target tab index.
     * @emits current
     * @returns {void}
     */
    switchTabTo(index) {
      if (index < 0 || index >= this.tabs.length) {
        return;
      }

      if (this.tab == index) {
        return;
      }

      this.$emit("current", index);
    },
    /**
     * Handles a user click on a tab.
     *
     * If the clicked tab is already active, emits `retap` (e.g. to toggle the
     * toolbar). Otherwise delegates to `switchTabTo`. No-op for out-of-range indices.
     *
     * @param {number} index - The index of the clicked tab.
     * @emits current
     * @emits retap
     * @returns {void}
     */
    switchTab(index) {
      if (index < 0 || index >= this.tabs.length) {
        return;
      }

      if (this.tab === index) {
        this.$emit("retap", index);

        return;
      }

      return this.switchTabTo(index);
    },
    /**
     * Emits the `close` event for the tab at `index`.
     *
     * @param {number} index - Index of the tab to close.
     * @emits close
     * @returns {void}
     */
    closeAt(index) {
      this.$emit("close", index);
    },
  },
};
</script>
