<!--
// Sshwifty - A Web SSH client
//
// Copyright (C) 2019 Rui NI <nirui@gmx.com>
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
  <div id="connect-known-list">
    <ul class="hlst lstcl1">
      <li v-for="(known, kk) in knownList" :key="kk">
        <div class="labels">
          <span class="type" :style="'background-color: ' + known.data.color">
            {{ known.data.type }}
          </span>
          <a
            class="opt link"
            href="javascript:;"
            @click="launcher(known, $event)"
          >
            {{ known.copyStatus }}
          </a>
          <a
            class="opt del"
            href="javascript:;"
            @click="remove(known.data.uid)"
          >
            Remove
          </a>
        </div>
        <div class="lst-wrap" @click="select(known.data)">
          <h2
            :title="known.data.title"
            :class="{ highlight: known.data.session }"
          >
            {{ known.data.title }}
          </h2>
          Last: {{ known.data.last.toLocaleString() }}
        </div>
      </li>
    </ul>
  </div>
</template>

<script>
import "./connect_known.css";

export default {
  props: {
    knowns: {
      type: Array,
      default: () => []
    },
    launcherBuilder: {
      type: Function,
      default: () => []
    }
  },
  data() {
    return {
      knownList: [],
      busy: false
    };
  },
  watch: {
    knowns(newVal) {
      this.reload(newVal);
    }
  },
  mounted() {
    this.reload(this.knowns);
  },
  methods: {
    reload(knownList) {
      this.knownList = [];

      for (let i in knownList) {
        this.knownList.unshift({
          data: knownList[i],
          copying: false,
          copyStatus: "Copy link"
        });
      }
    },
    select(known) {
      if (this.busy) {
        return;
      }

      this.$emit("select", known);
    },
    async launcher(known, ev) {
      if (known.copying || this.busy) {
        return;
      }

      ev.preventDefault();

      this.busy = true;
      known.copying = true;
      known.copyStatus = "Copying";

      let lnk = this.launcherBuilder(known.data);

      try {
        await navigator.clipboard.writeText(lnk);

        (() => {
          known.copyStatus = "Copied!";
        })();
      } catch (e) {
        (() => {
          known.copyStatus = "Failed";
          ev.target.setAttribute("href", lnk);
        })();
      }

      setTimeout(() => {
        known.copyStatus = "Copy link";
        known.copying = false;
      }, 2000);

      this.busy = false;
    },
    remove(uid) {
      if (this.busy) {
        return;
      }

      this.$emit("remove", uid);
    }
  }
};
</script>
