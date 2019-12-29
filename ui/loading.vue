<!--
// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
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
      <div v-else id="app-loading-error">
        &times;
      </div>

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
export default {
  props: {
    error: {
      type: String,
      default: ""
    }
  }
};
</script>
