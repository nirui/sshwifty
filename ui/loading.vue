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
  <div id="app-loading">
    <div id="app-loading-frame">
      <div v-if="error.length <= 0" id="app-loading-icon"></div>
      <div v-else id="app-loading-error">&times;</div>

      <h1 v-if="error.length <= 0" id="app-loading-title">
        Preparing client application
      </h1>
      <h1 v-else id="app-loading-title" class="error">
        {{ error }}
      </h1>
    </div>
  </div>
</template>

<script>
/**
 * @file loading.vue
 * @description Full-screen loading/error splash shown during application
 * bootstrap. Displays an animated spinner and "Preparing client application"
 * while `error` is empty; switches to an error cross and the error message
 * text once `error` becomes non-empty.
 */
export default {
  props: {
    /**
     * Fatal initialisation error message. An empty string renders the spinner;
     * any non-empty value switches the view to the error state.
     *
     * @type {string}
     */
    error: {
      type: String,
      default: "",
    },
  },
};
</script>
