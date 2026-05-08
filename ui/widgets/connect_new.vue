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
  <div id="connect-new">
    <ul class="lst1 lst-nostyle">
      <li
        v-for="(connector, ck) in connectors"
        :key="ck"
        @click="select(connector)"
      >
        <div class="lst-wrap">
          <h2 :style="'color: ' + connector.color()">{{ connector.name() }}</h2>
          {{ connector.description() }}
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
import "./connect_new.css";

/**
 * @fileoverview Displays the list of available connector types (SSH, Telnet,
 * etc.) so the user can start a new remote connection. Each connector is
 * rendered as a styled list item with its name and description.
 *
 * @prop {Array} connectors - Available connector descriptors. Each must expose
 *   `color()`, `name()`, and `description()` methods.
 *
 * @emits select - User chose a connector type. Payload: the connector object.
 */

export default {
  props: {
    connectors: {
      type: Array,
      default: () => [],
    },
  },
  methods: {
    /**
     * Emits the `select` event with the chosen connector descriptor.
     *
     * @param {Object} connector - The connector descriptor the user clicked.
     * @emits select
     * @returns {void}
     */
    select(connector) {
      this.$emit("select", connector);
    },
  },
};
</script>
