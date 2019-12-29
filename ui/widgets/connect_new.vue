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

export default {
  props: {
    connectors: {
      type: Array,
      default: () => []
    }
  },
  methods: {
    select(connector) {
      this.$emit("select", connector);
    }
  }
};
</script>
