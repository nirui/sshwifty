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
  <div id="connect-known-list" :class="{ reloaded: reloaded }">
    <div
      v-if="knownList.length <= 0 && presets <= 0"
      id="connect-known-list-empty"
    >
      No known remote available
    </div>
    <div v-else>
      <div v-if="knownList.length > 0" id="connect-known-list-list">
        <h3>Connected before</h3>

        <ul class="hlst lstcl1">
          <li v-for="(known, kk) in knownList" :key="kk">
            <div class="labels">
              <span
                class="type"
                :style="'background-color: ' + known.data.color"
              >
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
                v-if="!known.data.session"
                class="opt del"
                href="javascript:;"
                @click="remove(known.data.uid)"
              >
                Remove
              </a>
              <a
                v-else
                class="opt clr"
                href="javascript:;"
                title="Clear session data"
                @click="clearSession(known.data.uid)"
              >
                Clear
              </a>
            </div>

            <div class="lst-wrap" @click="select(known.data)">
              <h4
                :title="known.data.title"
                :class="{ highlight: known.data.session }"
              >
                {{ known.data.title }}
              </h4>
              Last: {{ known.data.last.toLocaleString() }}
            </div>
          </li>
        </ul>
      </div>

      <div
        v-if="presets.length > 0"
        id="connect-known-list-presets"
        :class="{
          'last-planel': knownList.length > 0
        }"
      >
        <h3>Presets</h3>

        <ul class="hlst lstcl2">
          <li
            v-for="(preset, pk) in presets"
            :key="pk"
            :class="{ disabled: presetDisabled(preset) }"
          >
            <div class="lst-wrap" @click="selectPreset(preset)">
              <div class="labels">
                <span
                  class="type"
                  :style="'background-color: ' + preset.command.color()"
                >
                  {{ preset.command.name() }}
                </span>
              </div>

              <h4 :title="preset.preset.title()">
                {{ preset.preset.title() }}
              </h4>
            </div>
          </li>
        </ul>

        <div v-if="restrictedToPresets" id="connect-known-list-presets-alert">
          The operator has disabled outgoing access to all remote hosts except
          those been defined as preset.
        </div>
      </div>
    </div>

    <div id="connect-known-list-import">
      Tip: You can
      <a href="javascript:;" @click="importHosts">import</a> and
      <a href="javascript:;" @click="exportHosts">export</a>
      known remotes from and to a file.
    </div>
  </div>
</template>

<script>
import "./connect_known.css";

export default {
  props: {
    presets: {
      type: Array,
      default: () => []
    },
    restrictedToPresets: {
      type: Boolean,
      default: () => false
    },
    knowns: {
      type: Array,
      default: () => []
    },
    launcherBuilder: {
      type: Function,
      default: () => []
    },
    knownsExport: {
      type: Function,
      default: () => []
    },
    knownsImport: {
      type: Function,
      default: () => []
    }
  },
  data() {
    return {
      knownList: [],
      reloaded: false,
      busy: false
    };
  },
  watch: {
    knowns(newVal) {
      // Only play reload animation when we're adding data into the records,
      // not reducing
      const playReloaded = newVal.length > this.knownList.length;

      this.reload(newVal);

      if (!playReloaded) {
        return;
      }

      const self = this;

      self.reloaded = true;
      setTimeout(() => {
        self.reloaded = false;
      }, 500);
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
    presetDisabled(preset) {
      if (!this.restrictedToPresets || preset.preset.host().length > 0) {
        return false;
      }

      return true;
    },
    selectPreset(preset) {
      if (this.busy || this.presetDisabled(preset)) {
        return;
      }

      this.$emit("select-preset", preset);
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
    },
    clearSession(uid) {
      if (this.busy) {
        return;
      }

      this.$emit("clear-session", uid);
    },
    exportHosts() {
      let el = null;

      try {
        const dataStr = JSON.stringify(this.knownsExport());

        el = document.createElement("a");
        el.setAttribute(
          "href",
          "data:text/plain;charset=utf-8," + btoa(dataStr)
        );
        el.setAttribute("target", "_blank");
        el.setAttribute("download", "sshwifty.known-remotes.txt");
        el.setAttribute(
          "style",
          "overflow: hidden; opacity: 0; width: 1px; height: 1px; top: -1px;" +
            "left: -1px; position: absolute;"
        );

        document.body.appendChild(el);

        el.click();
      } catch (e) {
        alert("Unable to export known remotes: " + e);
      }

      if (el === null) {
        return;
      }

      document.body.removeChild(el);
    },
    importHosts() {
      const self = this;

      let el = null;

      try {
        el = document.createElement("input");
        el.setAttribute("type", "file");
        el.setAttribute(
          "style",
          "overflow: hidden; opacity: 0; width: 1px; height: 1px; top: -1px;" +
            "left: -1px; position: absolute;"
        );
        el.addEventListener("change", ev => {
          const t = ev.target;

          if (t.files.length <= 0) {
            return;
          }

          t.disabled = "disabled";

          let r = new FileReader();

          r.onload = () => {
            try {
              self.knownsImport(JSON.parse(atob(r.result)));
            } catch (e) {
              alert("Unable to import known remotes due to error: " + e);
            }
          };

          r.readAsText(t.files[0], "utf-8");
        });

        document.body.appendChild(el);

        el.click();
      } catch (e) {
        alert("Unable to load known remotes data due to error: " + e);
      }

      if (el === null) {
        return;
      }

      document.body.removeChild(el);
    }
  }
};
</script>
