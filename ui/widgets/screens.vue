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
  <main :class="{ active: screens.length > 0 }">
    <slot v-if="screens.length <= 0"></slot>

    <div
      v-for="(screenInfo, idx) in screens"
      :key="screenInfo.id"
      :class="{ 'screen-inactive': screen !== idx }"
      class="screen"
    >
      <h1 style="display: none">Main Interface</h1>

      <div
        v-if="screenInfo.indicator.message.length > 0"
        class="screen-error"
        :class="'screen-error-level-' + screenInfo.indicator.level"
      >
        {{ screenInfo.indicator.message }}
      </div>

      <div class="screen-screen">
        <component
          :is="getComponent(screenInfo.ui)"
          :active="screen === idx"
          :control="screenInfo.control"
          :change="screenInfo.indicator"
          :toolbar="screenInfo.toolbar"
          :view-port="viewPort"
          :style="'background-color: ' + screenInfo.control.color()"
          class="screen-content"
          @stopped="stopped(idx, $event)"
          @warning="warning(idx, $event)"
          @info="info(idx, $event)"
          @updated="updated(idx)"
        ></component>
      </div>
    </div>
  </main>
</template>

<script>
import ConsoleScreen from "./screen_console.vue";

import "./screens.css";

/**
 * @fileoverview Multi-screen container that renders one active connection panel
 * per open tab and routes backend events (stopped, warning, info, updated) up
 * to the parent application shell.
 *
 * Each screen is always present in the DOM but toggled with the `.screen-inactive`
 * class to preserve xterm.js state (visibility:hidden approach). The component
 * uses a `switch`-based factory to map a `ui` string to the correct screen
 * component (currently only `"Console"`).
 *
 * @prop {number} screen    - Index of the currently visible screen.
 * @prop {Array}  screens   - Array of screen descriptors with `id`, `ui`, `control`,
 *   `indicator`, and `toolbar` fields.
 * @prop {Object} viewPort  - Viewport size descriptor forwarded to each screen.
 *
 * @emits stopped - A screen's connection ended. Payload: `(index, error)`.
 * @emits warning - A screen emitted a warning. Payload: `(index, msg)`.
 * @emits info    - A screen emitted an info message. Payload: `(index, msg)`.
 * @emits updated - A screen received new data. Payload: `(index)`.
 */

export default {
  components: {
    ConsoleScreen,
  },
  props: {
    screen: {
      type: Number,
      default: 0,
    },
    screens: {
      type: Array,
      default: () => [],
    },
    viewPort: {
      type: Object,
      default: () => {},
    },
  },
  methods: {
    /**
     * Maps a screen UI identifier to a registered component name.
     *
     * @param {string} ui - The UI type string from the screen descriptor (e.g. `"Console"`).
     * @returns {string} The locally registered component name to use with `<component :is>`.
     * @throws {Error} If the `ui` string does not match any registered screen component.
     */
    getComponent(ui) {
      switch (ui) {
        case "Console":
          return "ConsoleScreen";

        default:
          throw new Error("Unknown UI: " + ui);
      }
    },
    /**
     * Forwards a `stopped` event from a screen component.
     *
     * @param {number} index - Index of the screen that stopped.
     * @param {Error} stopErr - The error that caused the stop.
     * @emits stopped
     * @returns {void}
     */
    stopped(index, stopErr) {
      this.$emit("stopped", index, stopErr);
    },
    /**
     * Forwards a `warning` event from a screen component.
     *
     * @param {number} index - Index of the screen that emitted the warning.
     * @param {{text: string, toDismiss: boolean}} msg - Warning payload.
     * @emits warning
     * @returns {void}
     */
    warning(index, msg) {
      this.$emit("warning", index, msg);
    },
    /**
     * Forwards an `info` event from a screen component.
     *
     * @param {number} index - Index of the screen that emitted the message.
     * @param {{text: string, toDismiss: boolean}} msg - Info payload.
     * @emits info
     * @returns {void}
     */
    info(index, msg) {
      this.$emit("info", index, msg);
    },
    /**
     * Forwards an `updated` event from a screen component.
     *
     * @param {number} index - Index of the screen that received new data.
     * @emits updated
     * @returns {void}
     */
    updated(index) {
      this.$emit("updated", index);
    },
  },
};
</script>
