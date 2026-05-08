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
          intensify: connector.inputting && !windows.connect,
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
      :view-port="viewPort"
      @stopped="tabStopped"
      @warning="tabWarning"
      @info="tabInfo"
      @updated="tabUpdated"
    >
      <div id="home-content-wrap">
        <h1>Hi, this is Sshwifty</h1>

        <p>
          An Open Source Web SSH Client that enables you to connect to SSH
          servers without downloading any additional software.
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

        <div v-if="serverMessage.length > 0">
          <hr />
          <p class="secondary" v-html="serverMessage"></p>
        </div>
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
/**
 * @file home.vue
 * @description Main application shell rendered after successful authentication.
 * Owns the tab lifecycle (open, switch, close, retap), the connection wizard
 * flow (new/preset/known/launch), and the socket status indicator. Delegates
 * traffic history tracking to {@link home_socketctl} and known-remote
 * persistence to {@link home_historyctl}.
 */
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
    screens: Screens,
  },
  props: {
    /**
     * Full origin + pathname of the current page, used to construct shareable
     * launcher URLs (e.g. `https://host/path#+ ...`).
     *
     * @type {string}
     */
    hostPath: {
      type: String,
      default: "",
    },
    /**
     * URL hash fragment (without `#`) passed in at startup. A value starting
     * with `+` is treated as an auto-launch launcher string.
     *
     * @type {string}
     */
    query: {
      type: String,
      default: "",
    },
    /**
     * The {@link Socket} instance providing the multiplexed stream layer.
     *
     * @type {object}
     */
    connection: {
      type: Object,
      default: () => null,
    },
    /**
     * The {@link Controls} registry mapping protocol names to control factories.
     *
     * @type {object}
     */
    controls: {
      type: Object,
      default: () => null,
    },
    /**
     * The {@link Commands} registry mapping protocol names to command wizards.
     *
     * @type {object}
     */
    commands: {
      type: Object,
      default: () => null,
    },
    /**
     * Optional HTML message from the server rendered below the welcome text.
     *
     * @type {string}
     */
    serverMessage: {
      type: String,
      default: "",
    },
    /**
     * Preset remote configurations provided by the server configuration.
     *
     * @type {object}
     */
    presetData: {
      type: Object,
      default: () => new presets.Presets([]),
    },
    /**
     * When `true`, users may only connect to preset remotes and the free-form
     * connector UI is disabled.
     *
     * @type {boolean}
     */
    restrictedToPresets: {
      type: Boolean,
      default: () => false,
    },
    /**
     * Reactive viewport dimensions object with a `dim.width`/`dim.height` pair
     * kept in sync by the root app's resize listener.
     *
     * @type {object}
     */
    viewPort: {
      type: Object,
      default: () => null,
    },
  },
  data() {
    let history = home_history.build(this);

    return {
      ticker: null,
      windows: {
        delay: false,
        connect: false,
        tabs: false,
      },
      socket: home_socket.build(this),
      connector: {
        historyRec: history,
        connector: null,
        connectors: this.commands.all(),
        inputting: false,
        acquired: false,
        busy: false,
        knowns: history.all(),
      },
      presets: this.commands.mergePresets(this.presetData),
      tab: {
        current: -1,
        lastID: 0,
        tabs: [],
      },
    };
  },
  mounted() {
    this.ticker = setInterval(() => {
      this.tick();
    }, 1000);

    if (this.query.length > 1 && this.query.indexOf("+") === 0) {
      this.connectLaunch(this.query.slice(1, this.query.length), (success) => {
        if (!success) {
          return;
        }

        this.$emit("navigate-to", "");
      });
    }

    window.addEventListener("beforeunload", this.onBrowserClose);
  },
  beforeDestroy() {
    window.removeEventListener("beforeunload", this.onBrowserClose);

    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  },
  methods: {
    /**
     * `beforeunload` handler that prompts the user before closing the tab when
     * sessions are still active.
     *
     * @param {BeforeUnloadEvent} e - The browser close event.
     * @returns {string|undefined} The confirmation message, or `undefined` when
     *   no sessions are open (no prompt shown).
     */
    onBrowserClose(e) {
      if (this.tab.current < 0) {
        return undefined;
      }
      const msg = "Some tabs are still open, are you sure you want to exit?";
      (e || window.event).returnValue = msg;
      return msg;
    },
    /**
     * Called once per second by the component's `setInterval` ticker.
     *
     * Passes the current timestamp to the socket controller's `update` method
     * so traffic and latency history windows are flushed on schedule.
     *
     * @returns {void}
     */
    tick() {
      let now = new Date();

      this.socket.update(now, this);
    },
    /**
     * Closes all overlay windows (delay, connect, tabs) by setting each flag to `false`.
     *
     * @param {Event} [_e] - Optional DOM event (unused).
     * @returns {void}
     */
    closeAllWindow(_e) {
      for (let i in this.windows) {
        this.windows[i] = false;
      }
    },
    /**
     * Closes all overlays and opens the connection status/delay window.
     *
     * @returns {void}
     */
    showDelayWindow() {
      this.closeAllWindow();
      this.windows.delay = true;
    },
    /**
     * Closes all overlays and opens the connection wizard window.
     *
     * @returns {void}
     */
    showConnectWindow() {
      this.closeAllWindow();
      this.windows.connect = true;
    },
    /**
     * Closes all overlays and opens the tab list window.
     *
     * @returns {void}
     */
    showTabsWindow() {
      this.closeAllWindow();
      this.windows.tabs = true;
    },
    /**
     * Acquires the backend stream and calls `run` with it, calling `end` in all
     * exit paths (success and failure) to release the connection lock.
     *
     * Alerts the user with a descriptive error string when either the dial or
     * the `run` callback throws.
     *
     * @param {function(streams.Streams): void} run - Callback invoked with the
     *   open stream; must not throw asynchronously without catching.
     * @param {function(): void} end - Cleanup callback always invoked after `run`
     *   completes or fails.
     * @returns {Promise<void>}
     */
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
    /**
     * Guards the connection wizard against concurrent dial attempts and calls
     * `callback` with the acquired stream.
     *
     * Sets `connector.acquired` and `connector.busy` before dialing; both are
     * cleared in the `end` callback regardless of outcome.
     *
     * @param {function(streams.Streams): void} callback - Invoked once the stream
     *   is ready to receive a new session.
     * @returns {void}
     */
    runConnect(callback) {
      if (this.connector.acquired) {
        return;
      }

      this.connector.acquired = true;
      this.connector.busy = true;

      this.getStreamThenRun(
        (stream) => {
          this.connector.busy = false;

          callback(stream);
        },
        () => {
          this.connector.busy = false;
          this.connector.acquired = false;
        },
      );
    },
    /**
     * Opens the connection wizard for a protocol selected from the connector list.
     *
     * Invoked when the user selects a connector type (SSH or Telnet) in the
     * connect widget. Sets `connector.connector` to the wizard instance and
     * marks `connector.inputting` as true.
     *
     * @param {{ id: function(): string, name: function(): string,
     *   description: function(): string,
     *   wizard: function(...): object }} connector - The selected protocol command.
     * @returns {void}
     */
    connectNew(connector) {
      const self = this;

      self.runConnect((stream) => {
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
            false,
            () => {},
          ),
        };

        self.connector.inputting = true;
      });
    },
    /**
     * Opens the connection wizard pre-filled with the selected preset's data.
     *
     * @param {{ command: object, preset: object }} preset - A merged preset entry
     *   from `connector.presets`.
     * @returns {void}
     */
    connectPreset(preset) {
      const self = this;

      self.runConnect((stream) => {
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
            [],
            () => {},
          ),
        };

        self.connector.inputting = true;
      });
    },
    /**
     * Looks up a connector from the registry by its display name.
     *
     * @param {string} type - The connector name to find (e.g. `"SSH"`, `"Telnet"`).
     * @returns {object|null} The matching connector instance, or `null` when not found.
     */
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
    /**
     * Reconnects to a previously used remote from the known-remotes history.
     *
     * Resolves the protocol connector by `known.type` and executes the session
     * directly, bypassing the multi-step wizard.
     *
     * @param {{ type: string, data: object, session: object, keptSessions: Array }} known
     *   A known-remote entry from `connector.knowns`.
     * @returns {void}
     */
    connectKnown(known) {
      const self = this;

      self.runConnect((stream) => {
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
            known.keptSessions,
            () => {
              self.connector.knowns = self.connector.historyRec.all();
            },
          ),
        };

        self.connector.inputting = true;
      });
    },
    /**
     * Parses a launcher string of the form `"TYPE:query"` into its components.
     *
     * @param {string} ll - Launcher string from the URL hash (after stripping `+`).
     * @returns {{ type: string, query: string }} Parsed type and query.
     * @throws {Error} If the string does not contain a `:` separator or the type
     *   portion is empty.
     */
    parseConnectLauncher(ll) {
      let llSeparatorIdx = ll.indexOf(":");

      // Type must contain at least one charater
      if (llSeparatorIdx <= 0) {
        throw new Error("Invalid Launcher string");
      }

      return {
        type: ll.slice(0, llSeparatorIdx),
        query: ll.slice(llSeparatorIdx + 1, ll.length),
      };
    },
    /**
     * Initiates a connection from a launcher URL (hash auto-launch).
     *
     * Opens the connect window, parses the launcher string, and executes the
     * `launch` path on the matching connector. Calls `done(success)` once the
     * connection attempt resolves.
     *
     * @param {string} launcher - Launcher string (e.g. `"SSH:user@host:22"`).
     * @param {function(boolean): void} done - Callback invoked with `true` on
     *   success or `false` on failure.
     * @returns {void}
     */
    connectLaunch(launcher, done) {
      this.showConnectWindow();

      this.runConnect((stream) => {
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
            (n) => {
              self.connector.knowns = self.connector.historyRec.all();

              done(n.data().success);
            },
          ),
        };

        this.connector.inputting = true;
      });
    },
    /**
     * Constructs a shareable URL hash launcher string for a known remote.
     *
     * Returns `undefined` when the remote's connector type is not registered.
     *
     * @param {{ type: string, data: object }} known - A known-remote entry.
     * @returns {string|undefined} Full URL with `#+` launcher hash, or `undefined`.
     */
    buildknownLauncher(known) {
      let connector = this.getConnectorByType(known.type);

      if (!connector) {
        return;
      }

      return this.hostPath + "#+" + connector.launcher(known.data);
    },
    /**
     * Returns the serialised export data for all known remotes.
     *
     * Delegates to `historyRec.export()` and passes the result to the
     * connect widget for download.
     *
     * @returns {string} JSON-encoded known-remotes export payload.
     */
    exportKnowns() {
      return this.connector.historyRec.export();
    },
    /**
     * Imports a known-remotes payload and refreshes the reactive knowns list.
     *
     * @param {string} d - JSON-encoded known-remotes import payload.
     * @returns {void}
     */
    importKnowns(d) {
      this.connector.historyRec.import(d);

      this.connector.knowns = this.connector.historyRec.all();
    },
    /**
     * Removes a known remote by its unique ID and refreshes the reactive list.
     *
     * @param {string} uid - The unique identifier of the known remote to remove.
     * @returns {void}
     */
    removeKnown(uid) {
      this.connector.historyRec.del(uid);

      this.connector.knowns = this.connector.historyRec.all();
    },
    /**
     * Clears the saved session data for a known remote without removing the entry.
     *
     * @param {string} uid - The unique identifier of the known remote.
     * @returns {void}
     */
    clearSessionKnown(uid) {
      this.connector.historyRec.clearSession(uid);

      this.connector.knowns = this.connector.historyRec.all();
    },
    /**
     * Cancels an in-progress connection wizard and releases the connection lock.
     *
     * Resets `connector.inputting` and `connector.acquired` so a new connection
     * attempt may be started.
     *
     * @returns {void}
     */
    cancelConnection() {
      this.connector.inputting = false;
      this.connector.acquired = false;
    },
    /**
     * Handles a successful connection, closes the connect window, and opens a
     * new session tab for the established connection.
     *
     * @param {{ name: string, info: string, control: object, ui: string }} data
     *   Session data returned by the connector wizard on success.
     * @returns {void}
     */
    connectionSucceed(data) {
      this.connector.inputting = false;
      this.connector.acquired = false;
      this.windows.connect = false;

      this.addToTab(data);

      this.$emit("tab-opened", this.tab.tabs);
    },
    /**
     * Appends a new session tab to the tab list and switches to it.
     *
     * Constructs a full tab descriptor with a unique auto-incremented `id`,
     * indicator state, and closing status flag.
     *
     * @param {{ name: string, info: string, control: object, ui: string }} data
     *   Session data used to populate the new tab descriptor.
     * @returns {Promise<void>}
     */
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
            updated: false,
          },
          status: {
            closing: false,
          },
        }) - 1,
      );
    },
    /**
     * Removes the tab at `index` from the tab list and selects an adjacent tab.
     *
     * If the removed tab was the last in the list the active index becomes the
     * new last tab; otherwise the same index is selected (which now points to
     * the following tab).
     *
     * @param {number} index - Zero-based index of the tab to remove.
     * @returns {void}
     */
    removeFromTab(index) {
      let isLast = index === this.tab.tabs.length - 1;

      this.tab.tabs.splice(index, 1);
      this.tab.current = isLast ? this.tab.tabs.length - 1 : index;
    },
    /**
     * Switches the active session tab to `to`.
     *
     * Calls `disabled()` on the currently active tab's control before switching,
     * then calls `enabled()` on the newly active tab. Clears the update
     * indicator for the incoming tab.
     *
     * @param {number} to - Zero-based index of the tab to activate.
     * @returns {Promise<void>}
     */
    async switchTab(to) {
      if (this.tab.current >= 0) {
        await this.tab.tabs[this.tab.current].control.disabled();
      }

      this.tab.current = to;

      this.tab.tabs[this.tab.current].indicator.updated = false;
      await this.tab.tabs[this.tab.current].control.enabled();
    },
    /**
     * Toggles the toolbar for the tab at `tab` and notifies the control.
     *
     * @param {number} tab - Zero-based index of the tab whose toolbar should toggle.
     * @returns {Promise<void>}
     */
    async retapTab(tab) {
      this.tab.tabs[tab].toolbar = !this.tab.tabs[tab].toolbar;

      await this.tab.tabs[tab].control.retap(this.tab.tabs[tab].toolbar);
    },
    /**
     * Closes the session tab at `index`, waiting for the control to clean up.
     *
     * Guards against duplicate close events via `status.closing`. Removes the
     * tab from the list and emits `"tab-closed"` after the control resolves.
     *
     * @param {number} index - Zero-based index of the tab to close.
     * @returns {Promise<void>}
     */
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
    /**
     * Updates the tab indicator when the remote session stops.
     *
     * Sets an error-level indicator message when `reason` is non-null;
     * clears the indicator for a clean stop.
     *
     * @param {number} index - Zero-based tab index.
     * @param {string|null} reason - Stop reason string, or `null` for a clean stop.
     * @returns {void}
     */
    tabStopped(index, reason) {
      if (reason !== null) {
        this.tab.tabs[index].indicator.message = "" + reason;
        this.tab.tabs[index].indicator.level = "error";
      } else {
        this.tab.tabs[index].indicator.message = "";
        this.tab.tabs[index].indicator.level = "";
      }
    },
    /**
     * Sets or dismisses an indicator message on a tab.
     *
     * When `msg.toDismiss` is `true`, the message is cleared only if it matches
     * the currently displayed message and level (prevents dismissing a newer message).
     *
     * @param {number} index - Zero-based tab index.
     * @param {{ text: string, toDismiss: boolean }} msg - Message descriptor.
     * @param {string} type - Severity level: `"warning"` or `"info"`.
     * @returns {void}
     */
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
    /**
     * Delegates to `tabMessage` with `"warning"` severity.
     *
     * @param {number} index - Zero-based tab index.
     * @param {{ text: string, toDismiss: boolean }} msg - Message descriptor.
     * @returns {void}
     */
    tabWarning(index, msg) {
      this.tabMessage(index, msg, "warning");
    },
    /**
     * Delegates to `tabMessage` with `"info"` severity.
     *
     * @param {number} index - Zero-based tab index.
     * @param {{ text: string, toDismiss: boolean }} msg - Message descriptor.
     * @returns {void}
     */
    tabInfo(index, msg) {
      this.tabMessage(index, msg, "info");
    },
    /**
     * Marks a tab as having unseen activity and emits `"tab-updated"` to the root app.
     *
     * Sets `indicator.updated` to `true` only when the tab is not currently active,
     * so the visual dot indicator does not appear on the focused tab.
     *
     * @param {number} index - Zero-based tab index that received new data.
     * @returns {void}
     */
    tabUpdated(index) {
      this.$emit("tab-updated", this.tab.tabs);

      this.tab.tabs[index].indicator.updated = index !== this.tab.current;
    },
  },
};
</script>
