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
  <div :id="id">
    <tab-list
      :id="id + '-tabs'"
      :tab="tab"
      :tabs="tabs"
      :tabs-class="tabsClass"
      @current="$emit('current', $event)"
      @retap="$emit('retap', $event)"
      @close="$emit('close', $event)"
    ></tab-list>

    <a
      v-if="tabs.length > 0"
      :id="id + '-list'"
      :class="listTriggerClass"
      href="javascript:;"
      @click="showList"
    ></a>
  </div>
</template>

<script>
import TabList from "./tab_list.vue";

export default {
  components: {
    "tab-list": TabList
  },
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
    },
    listTriggerClass: {
      type: String,
      default: ""
    }
  },
  methods: {
    showList() {
      this.$emit("list", this.tabs);
    }
  }
};
</script>
