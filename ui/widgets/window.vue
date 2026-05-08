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
  <div
    :id="id"
    class="window window1"
    :class="[{ display: displaying }, { [flashClass]: displaying }]"
  >
    <div class="window-frame">
      <slot />
    </div>

    <span
      :id="id + '-close'"
      class="window-close icon icon-close1"
      @click="hide"
    />
  </div>
</template>

<script>
/**
 * @fileoverview Generic floating overlay window widget. Renders a `.window1`
 * div that toggles the `display` and `flashClass` CSS classes based on an
 * internal `displaying` boolean. Exposes `show()` / `hide()` methods driven by
 * the `display` prop watcher and a close icon that calls `hide()` directly.
 *
 * All overlay panels (connect, status, tab-window) wrap their content in this
 * component to get consistent show/hide behaviour and a styled close button.
 *
 * @prop {string}  id         - HTML id applied to the root element.
 * @prop {boolean} display    - External signal to show (true) or hide (false) the window.
 * @prop {string}  flashClass - CSS class added alongside `.display` when the window is shown,
 *   used to trigger a flash/entry animation.
 *
 * @emits display - Emitted whenever the visibility state changes.
 *   Payload: `{boolean}` — true when shown, false when hidden.
 */

export default {
  props: {
    id: {
      type: String,
      default: "",
    },
    display: {
      type: Boolean,
      default: false,
    },
    flashClass: {
      type: String,
      default: "",
    },
  },
  /**
   * @returns {{displaying: boolean}}
   *   `displaying` — internal visibility flag; true while the overlay is shown.
   *   Driven by `show()` / `hide()` and mirrored to the template via CSS classes.
   */
  data() {
    return {
      displaying: false,
    };
  },
  watch: {
    display(newVal) {
      newVal ? this.show() : this.hide();
    },
  },
  methods: {
    /**
     * Makes the overlay visible and emits `display` with `true`.
     *
     * @emits display - Payload: `{true}`.
     * @returns {void}
     */
    show() {
      this.displaying = true;

      this.$emit("display", this.displaying);
    },
    /**
     * Hides the overlay and emits `display` with `false`.
     * Also called when the user clicks the built-in close icon.
     *
     * @emits display - Payload: `{false}`.
     * @returns {void}
     */
    hide() {
      this.displaying = false;

      this.$emit("display", this.displaying);
    },
  },
};
</script>
