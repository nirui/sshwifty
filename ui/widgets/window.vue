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
export default {
  props: {
    id: {
      type: String,
      default: ""
    },
    display: {
      type: Boolean,
      default: false
    },
    flashClass: {
      type: String,
      default: ""
    }
  },
  data() {
    return {
      displaying: false
    };
  },
  watch: {
    display(newVal) {
      newVal ? this.show() : this.hide();
    }
  },
  methods: {
    show() {
      this.displaying = true;

      this.$emit("display", this.displaying);
    },
    hide() {
      this.displaying = false;

      this.$emit("display", this.displaying);
    }
  }
};
</script>
