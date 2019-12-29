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
  <ul :id="id" :class="tabsClass">
    <li
      v-for="(tabInfo, idx) in tabs"
      :key="tabInfo.id"
      :class="{
        active: tab === idx,
        error:
          tabInfo.indicator.message.length > 0 &&
          tabInfo.indicator.level === 'error',
        updated: tabInfo.indicator.updated && tab !== idx
      }"
      :style="
        'background: ' +
          (tab === idx
            ? tabInfo.control.activeColor()
            : tabInfo.control.color())
      "
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
export default {
  props: {
    id: {
      type: String,
      default: ""
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
    tab(newVal) {
      this.switchTabTo(newVal);
    },
    tabs(newVal) {
      if (newVal.length > this.tab) {
        return;
      }

      this.switchTabTo(newVal.length - 1);
    }
  },
  methods: {
    switchTabTo(index) {
      if (index < 0 || index >= this.tabs.length) {
        return;
      }

      if (this.tab == index) {
        return;
      }

      this.$emit("current", index);
    },
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
    closeAt(index) {
      this.$emit("close", index);
    }
  }
};
</script>
