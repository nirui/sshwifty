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
  <div id="home">
    <header id="home-header">
      <h1 id="home-hd-title">Sshwifty</h1>

      <a id="home-hd-delay" href="javascript:;" @click="showDelayWindow">
        <span
          id="home-hd-delay-icon"
          class="icon icon-point1"
          :class="socket.classStyle"
        ></span>
        <span v-if="socket.message.length > 0" id="home-hd-delay-value">{{
          socket.message
        }}</span>
      </a>

      <a
        id="home-hd-plus"
        class="icon icon-plus1"
        href="javascript:;"
        :class="{
          working: connector.inputting,
          intensify: connector.inputting && !windows.connect
        }"
        @click="showConnectWindow"
      ></a>

      <tabs
        id="home-hd-tabs"
        :tab="tab.current"
        :tabs="tab.tabs"
        tabs-class="tab1"
        list-trigger-class="icon icon-more1"
        @current="switchTab"
        @retap="retapTab"
        @list="showTabsWindow"
        @close="closeTab"
      ></tabs>
    </header>

    <screens
      id="home-content"
      :screen="tab.current"
      :screens="tab.tabs"
      @stopped="tabStopped"
      @warning="tabWarning"
      @info="tabInfo"
      @updated="tabUpdated"
    >
      <div id="home-content-wrap">
        <h1>
          Hi, this is Sshwifty
        </h1>

        <p>
          An Open Source Web SSH Client that enables you to connect to SSH
          servers without download any additional software.
        </p>

        <p>
          To get started, click the
          <span
            id="home-content-connect"
            class="icon icon-plus1"
            @click="showConnectWindow"
          ></span>
          icon near the top left corner.
        </p>

        <hr />

        <p class="secondary">
          Programmers in China launched an online campaign against
          <a
            href="https://en.wikipedia.org/wiki/996_working_hour_system"
            target="blank"
            >implicitly forced overtime work</a
          >. Sshwifty wouldn't exist if it's author must work such extreme
          hours. If you're benefiting from hobbyist project like this one,
          please consider to
          <a
            href="https://github.com/996icu/996.ICU/#what-can-i-do"
            target="blank"
            >support the action</a
          >.
        </p>
      </div>
    </screens>

    <connect-widget
      :inputting="connector.inputting"
      :display="windows.connect"
      :connectors="connector.connectors"
      :presets="presets"
      :restricted-to-presets="restrictedToPresets"
      :knowns="connector.knowns"
      :knowns-launcher-builder="buildknownLauncher"
      :knowns-export="exportKnowns"
      :knowns-import="importKnowns"
      :busy="connector.busy"
      @display="windows.connect = $event"
      @connector-select="connectNew"
      @known-select="connectKnown"
      @known-remove="removeKnown"
      @preset-select="connectPreset"
      @known-clear-session="clearSessionKnown"
    >
      <connector
        :connector="connector.connector"
        @cancel="cancelConnection"
        @done="connectionSucceed"
      >
      </connector>
    </connect-widget>
    <status-widget
      :class="socket.windowClass"
      :display="windows.delay"
      :status="socket.status"
      @display="windows.delay = $event"
    ></status-widget>
    <tab-window
      :tab="tab.current"
      :tabs="tab.tabs"
      :display="windows.tabs"
      tabs-class="tab1 tab1-list"
      @display="windows.tabs = $event"
      @current="switchTab"
      @retap="retapTab"
      @close="closeTab"
    ></tab-window>
  </div>
</template>

<script>
import "./home.css";

import ConnectWidget from "./widgets/connect.vue";
import StatusWidget from "./widgets/status.vue";
import Connector from "./widgets/connector.vue";
import Tabs from "./widgets/tabs.vue";
import TabWindow from "./widgets/tab_window.vue";
import Screens from "./widgets/screens.vue";

import * as home_socket from "./home_socketctl.js";
import * as home_history from "./home_historyctl.js";

import * as presets from "./commands/presets.js";

const BACKEND_CONNECT_ERROR =
  "Unable to connect to the Sshwifty backend server: ";
const BACKEND_REQUEST_ERROR = "Unable to perform request: ";

export default {
  components: {
    "connect-widget": ConnectWidget,
    "status-widget": StatusWidget,
    connector: Connector,
    tabs: Tabs,
    "tab-window": TabWindow,
    screens: Screens
  },
  props: {
    hostPath: {
      type: String,
      default: ""
    },
    query: {
      type: String,
      default: ""
    },
    connection: {
      type: Object,
      default: () => {
        return null;
      }
    },
    controls: {
      type: Object,
      default: () => {
        return null;
      }
    },
    commands: {
      type: Object,
      default: () => {
        return null;
      }
    },
    presetData: {
      type: Object,
      default: () => {
        return new presets.Presets([]);
      }
    },
    restrictedToPresets: {
      type: Boolean,
      default: () => {
        return false;
      }
    }
  },
  data() {
    let history = home_history.build(this);

    return {
      ticker: null,
      windows: {
        delay: false,
        connect: false,
        tabs: false
      },
      socket: home_socket.build(this),
      connector: {
        historyRec: history,
        connector: null,
        connectors: this.commands.all(),
        inputting: false,
        acquired: false,
        busy: false,
        knowns: history.all()
      },
      presets: this.commands.mergePresets(this.presetData),
      tab: {
        current: -1,
        lastID: 0,
        tabs: []
      }
    };
  },
  mounted() {
    this.ticker = setInterval(() => {
      this.tick();
    }, 1000);

    if (this.query.length > 1 && this.query.indexOf("+") === 0) {
      this.connectLaunch(this.query.slice(1, this.query.length), success => {
        if (!success) {
          return;
        }

        this.$emit("navigate-to", "");
      });
    }
  },
  beforeDestroy() {
    if (this.ticker === null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  },
  methods: {
    tick() {
      let now = new Date();

      this.socket.update(now, this);
    },
    closeAllWindow() {
      for (let i in this.windows) {
        this.windows[i] = false;
      }
    },
    showDelayWindow() {
      this.closeAllWindow();
      this.windows.delay = true;
    },
    showConnectWindow() {
      this.closeAllWindow();
      this.windows.connect = true;
    },
    showTabsWindow() {
      this.closeAllWindow();
      this.windows.tabs = true;
    },
    async getStreamThenRun(run, end) {
      let errStr = null;

      try {
        let conn = await this.connection.get(this.socket);

        try {
          run(conn);
        } catch (e) {
          errStr = BACKEND_REQUEST_ERROR + e;

          process.env.NODE_ENV === "development" && console.trace(e);
        }
      } catch (e) {
        errStr = BACKEND_CONNECT_ERROR + e;

        process.env.NODE_ENV === "development" && console.trace(e);
      }

      end();

      if (errStr !== null) {
        alert(errStr);
      }
    },
    runConnect(callback) {
      if (this.connector.acquired) {
        return;
      }

      this.connector.acquired = true;
      this.connector.busy = true;

      this.getStreamThenRun(
        stream => {
          this.connector.busy = false;

          callback(stream);
        },
        () => {
          this.connector.busy = false;
          this.connector.acquired = false;
        }
      );
    },
    connectNew(connector) {
      const self = this;

      self.runConnect(stream => {
        self.connector.connector = {
          id: connector.id(),
          name: connector.name(),
          description: connector.description(),
          wizard: connector.wizard(
            stream,
            self.controls,
            self.connector.historyRec,
            presets.emptyPreset(),
            null,
            () => {}
          )
        };

        self.connector.inputting = true;
      });
    },
    connectPreset(preset) {
      const self = this;

      self.runConnect(stream => {
        self.connector.connector = {
          id: preset.command.id(),
          name: preset.command.name(),
          description: preset.command.description(),
          wizard: preset.command.wizard(
            stream,
            self.controls,
            self.connector.historyRec,
            preset.preset,
            null,
            () => {}
          )
        };

        self.connector.inputting = true;
      });
    },
    getConnectorByType(type) {
      let connector = null;

      for (let c in this.connector.connectors) {
        if (this.connector.connectors[c].name() !== type) {
          continue;
        }

        connector = this.connector.connectors[c];
      }

      return connector;
    },
    connectKnown(known) {
      const self = this;

      self.runConnect(stream => {
        let connector = self.getConnectorByType(known.type);

        if (!connector) {
          alert("Unknown connector: " + known.type);

          self.connector.inputting = false;

          return;
        }

        self.connector.connector = {
          id: connector.id(),
          name: connector.name(),
          description: connector.description(),
          wizard: connector.execute(
            stream,
            self.controls,
            self.connector.historyRec,
            known.data,
            known.session,
            () => {
              self.connector.knowns = self.connector.historyRec.all();
            }
          )
        };

        self.connector.inputting = true;
      });
    },
    parseConnectLauncher(ll) {
      let llSeparatorIdx = ll.indexOf(":");

      // Type must contain at least one charater
      if (llSeparatorIdx <= 0) {
        throw new Error("Invalid Launcher string");
      }

      return {
        type: ll.slice(0, llSeparatorIdx),
        query: ll.slice(llSeparatorIdx + 1, ll.length)
      };
    },
    connectLaunch(launcher, done) {
      this.showConnectWindow();

      this.runConnect(stream => {
        let ll = this.parseConnectLauncher(launcher),
          connector = this.getConnectorByType(ll.type);

        if (!connector) {
          alert("Unknown connector: " + ll.type);

          this.connector.inputting = false;

          return;
        }

        const self = this;

        this.connector.connector = {
          id: connector.id(),
          name: connector.name(),
          description: connector.description(),
          wizard: connector.launch(
            stream,
            this.controls,
            this.connector.historyRec,
            ll.query,
            n => {
              self.connector.knowns = self.connector.historyRec.all();

              done(n.data().success);
            }
          )
        };

        this.connector.inputting = true;
      });
    },
    buildknownLauncher(known) {
      let connector = this.getConnectorByType(known.type);

      if (!connector) {
        return;
      }

      return this.hostPath + "#+" + connector.launcher(known.data);
    },
    exportKnowns() {
      return this.connector.historyRec.export();
    },
    importKnowns(d) {
      this.connector.historyRec.import(d);

      this.connector.knowns = this.connector.historyRec.all();
    },
    removeKnown(uid) {
      this.connector.historyRec.del(uid);

      this.connector.knowns = this.connector.historyRec.all();
    },
    clearSessionKnown(uid) {
      this.connector.historyRec.clearSession(uid);

      this.connector.knowns = this.connector.historyRec.all();
    },
    cancelConnection() {
      this.connector.inputting = false;
      this.connector.acquired = false;
    },
    connectionSucceed(data) {
      this.connector.inputting = false;
      this.connector.acquired = false;
      this.windows.connect = false;

      this.addToTab(data);

      this.$emit("tab-opened", this.tab.tabs);
    },
    async addToTab(data) {
      await this.switchTab(
        this.tab.tabs.push({
          id: this.tab.lastID++,
          name: data.name,
          info: data.info,
          control: data.control,
          ui: data.ui,
          toolbar: false,
          indicator: {
            level: "",
            message: "",
            updated: false
          },
          status: {
            closing: false
          }
        }) - 1
      );
    },
    removeFromTab(index) {
      let isLast = index === this.tab.tabs.length - 1;

      this.tab.tabs.splice(index, 1);
      this.tab.current = isLast ? this.tab.tabs.length - 1 : index;
    },
    async switchTab(to) {
      if (this.tab.current >= 0) {
        await this.tab.tabs[this.tab.current].control.disabled();
      }

      this.tab.current = to;

      this.tab.tabs[this.tab.current].indicator.updated = false;
      await this.tab.tabs[this.tab.current].control.enabled();
    },
    async retapTab(tab) {
      this.tab.tabs[tab].toolbar = !this.tab.tabs[tab].toolbar;

      await this.tab.tabs[tab].control.retap(this.tab.tabs[tab].toolbar);
    },
    async closeTab(index) {
      if (this.tab.tabs[index].status.closing) {
        return;
      }

      this.tab.tabs[index].status.closing = true;

      try {
        this.tab.tabs[index].control.disabled();

        await this.tab.tabs[index].control.close();
      } catch (e) {
        alert("Cannot close tab due to error: " + e);

        process.env.NODE_ENV === "development" && console.trace(e);
      }

      this.removeFromTab(index);

      this.$emit("tab-closed", this.tab.tabs);
    },
    tabStopped(index, reason) {
      if (reason !== null) {
        this.tab.tabs[index].indicator.message = "" + reason;
        this.tab.tabs[index].indicator.level = "error";
      } else {
        this.tab.tabs[index].indicator.message = "";
        this.tab.tabs[index].indicator.level = "";
      }
    },
    tabMessage(index, msg, type) {
      if (msg.toDismiss) {
        if (
          this.tab.tabs[index].indicator.message !== msg.text ||
          this.tab.tabs[index].indicator.level !== type
        ) {
          return;
        }

        this.tab.tabs[index].indicator.message = "";
        this.tab.tabs[index].indicator.level = "";

        return;
      }

      this.tab.tabs[index].indicator.message = msg.text;
      this.tab.tabs[index].indicator.level = type;
    },
    tabWarning(index, msg) {
      this.tabMessage(index, msg, "warning");
    },
    tabInfo(index, msg) {
      this.tabMessage(index, msg, "info");
    },
    tabUpdated(index) {
      this.$emit("tab-updated", this.tab.tabs);

      this.tab.tabs[index].indicator.updated = index !== this.tab.current;
    }
  }
};
</script>
