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
  <window
    id="tab-window"
    flash-class="home-window-display"
    :display="display"
    @display="$emit('display', $event)"
  >
    <h1 class="window-title">Opened tabs</h1>

    <tab-list
      id="tab-window-tabs"
      :tab="tab"
      :tabs="tabs"
      :tabs-class="tabsClass"
      @current="$emit('current', $event)"
      @retap="$emit('retap', $event)"
      @close="$emit('close', $event)"
    ></tab-list>
  </window>
</template>

<script>
import "./tab_window.css";

import Window from "./window.vue";
import TabList from "./tab_list.vue";

export default {
  components: {
    window: Window,
    "tab-list": TabList
  },
  props: {
    display: {
      type: Boolean,
      default: false
    },
    tab: {
      type: Number,
      default: -1
    },
    tabs: {
      type: Array,
      default: () => []
    },
    tabsClass: {
      type: String,
      default: ""
    }
  },
  watch: {
    tabs(newV) {
      if (newV.length > 0) {
        return;
      }

      this.$emit("display", false);
    }
  }
};
</script>
