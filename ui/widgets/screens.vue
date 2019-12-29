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
  <main style="position: relative">
    <slot v-if="screens.length <= 0"></slot>

    <div
      v-for="(screenInfo, idx) in screens"
      :key="screenInfo.id"
      :style="'visibility: ' + (screen === idx ? 'visible' : 'hidden')"
      class="screen"
      style="top: 0; right: 0; left: 0; bottom: 0; padding： 0; margin: 0; overflow: auto; position: absolute;"
    >
      <h1 style="display:none;">Main Interface</h1>

      <div
        v-if="screenInfo.indicator.message.length > 0"
        class="screen-error"
        :class="'screen-error-level-' + screenInfo.indicator.level"
      >
        {{ screenInfo.indicator.message }}
      </div>

      <div class="screen-screen" style="position: relative">
        <component
          :is="getComponent(screenInfo.ui)"
          :active="screen === idx"
          :control="screenInfo.control"
          :change="screenInfo.indicator"
          :toolbar="screenInfo.toolbar"
          :style="'background-color: ' + screenInfo.control.activeColor()"
          style="top: 0; right: 0; left: 0; bottom: 0; padding： 0; margin: 0; position: absolute; overflow: hidden"
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

export default {
  components: {
    ConsoleScreen
  },
  props: {
    screen: {
      type: Number,
      default: 0
    },
    screens: {
      type: Array,
      default: () => []
    }
  },
  methods: {
    getComponent(ui) {
      switch (ui) {
        case "Console":
          return "ConsoleScreen";

        default:
          throw new Error("Unknown UI: " + ui);
      }
    },
    stopped(index, stopErr) {
      this.$emit("stopped", index, stopErr);
    },
    warning(index, msg) {
      this.$emit("warning", index, msg);
    },
    info(index, msg) {
      this.$emit("info", index, msg);
    },
    updated(index) {
      this.$emit("updated", index);
    }
  }
};
</script>
