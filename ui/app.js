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

import Vue from "vue";
import "./app.css";
import Auth from "./auth.vue";
import { Color as ControlColor } from "./commands/color.js";
import { Commands } from "./commands/commands.js";
import { Controls } from "./commands/controls.js";
import { Presets } from "./commands/presets.js";
import * as ssh from "./commands/ssh.js";
import * as telnet from "./commands/telnet.js";
import "./common.css";
import * as sshctl from "./control/ssh.js";
import * as telnetctl from "./control/telnet.js";
import * as cipher from "./crypto.js";
import Home from "./home.vue";
import "./landing.css";
import Loading from "./loading.vue";
import { Socket } from "./socket.js";
import * as xhr from "./xhr.js";

const backendQueryRetryDelay = 2000;

const maxTimeDiff = 30000;

const updateIndicatorMaxDisplayTime = 3000;

const mainTemplate = `
<home
  v-if="page == 'app'"
  :host-path="hostPath"
  :query="query"
  :connection="socket"
  :controls="controls"
  :commands="commands"
  :preset-data="presetData.presets"
  :restricted-to-presets="presetData.restricted"
  @navigate-to="changeURLHash"
  @tab-opened="tabOpened"
  @tab-closed="tabClosed"
  @tab-updated="tabUpdated"
></home>
<auth
  v-else-if="page == 'auth'"
  :error="authErr"
  @auth="submitAuth"
></auth>
<loading v-else :error="loadErr"></loading>
`.trim();

const socksInterface = "/sshwifty/socket";
const socksVerificationInterface = socksInterface + "/verify";

function startApp(rootEl) {
  const pageTitle = document.title;

  let uiControlColor = new ControlColor();

  new Vue({
    el: rootEl,
    components: {
      loading: Loading,
      auth: Auth,
      home: Home
    },
    data() {
      return {
        hostPath:
          window.location.protocol +
          "//" +
          window.location.host +
          window.location.pathname,
        query:
          window.location.hash.length > 0 &&
          window.location.hash.indexOf("#") === 0
            ? window.location.hash.slice(1, window.location.hash.length)
            : "",
        page: "loading",
        key: "",
        presetData: {
          presets: new Presets([]),
          restricted: false
        },
        authErr: "",
        loadErr: "",
        socket: null,
        controls: new Controls([
          new telnetctl.Telnet(uiControlColor),
          new sshctl.SSH(uiControlColor)
        ]),
        commands: new Commands([new telnet.Command(), new ssh.Command()]),
        tabUpdateIndicator: null
      };
    },
    watch: {
      loadErr() {
        this.isErrored()
          ? document.body.classList.add("app-error")
          : document.body.classList.remove("app-error");
      },
      authErr() {
        this.isErrored()
          ? document.body.classList.add("app-error")
          : document.body.classList.remove("app-error");
      }
    },
    mounted() {
      this.tryInitialAuth();
    },
    methods: {
      changeTitleInfo(newTitleInfo) {
        document.title = newTitleInfo + " " + pageTitle;
      },
      resetTitleInfo() {
        document.title = pageTitle;
      },
      changeURLHash(newHash) {
        window.location.hash = newHash;
      },
      isErrored() {
        return this.authErr.length > 0 || this.loadErr.length > 0;
      },
      async getSocketAuthKey(privateKey, randomKey) {
        const enc = new TextEncoder();

        return new Uint8Array(
          await cipher.hmac512(enc.encode(privateKey), enc.encode(randomKey))
        ).slice(0, 32);
      },
      buildBackendSocketURL() {
        let r = "";

        switch (location.protocol) {
          case "https:":
            r = "wss://";
            break;

          default:
            r = "ws://";
        }

        r += location.host + socksInterface;

        return r;
      },
      buildSocket(key, dialTimeout, heartbeatInterval) {
        return new Socket(
          this.buildBackendSocketURL(),
          key,
          dialTimeout * 1000,
          heartbeatInterval * 1000
        );
      },
      executeHomeApp(authResult, key) {
        this.presetData = {
          presets: new Presets(JSON.parse(authResult.data)),
          restricted: authResult.onlyAllowPresetRemotes
        };
        this.socket = this.buildSocket(
          key,
          authResult.timeout,
          authResult.heartbeat
        );
        this.page = "app";
      },
      async tryInitialAuth() {
        try {
          let result = await this.doAuth("");

          if (result.date) {
            let serverTime = result.date.getTime(),
              clientTime = new Date().getTime(),
              timeDiff = Math.abs(serverTime - clientTime);

            if (timeDiff > maxTimeDiff) {
              this.loadErr =
                "The time difference between this client " +
                "and the backend server is beyond operational limit.\r\n\r\n" +
                "Please try reload the page, and if the problem persisted, " +
                "consider to adjust your local time so both the client and " +
                "the server are running at same date time";

              return;
            }
          }

          let self = this;

          switch (result.result) {
            case 200:
              this.executeHomeApp(result, {
                data: result.key,
                async fetch() {
                  if (this.data) {
                    let dKey = this.data;

                    this.data = null;

                    return dKey;
                  }

                  let result = await self.doAuth("");

                  if (result.result !== 200) {
                    throw new Error(
                      "Unable to fetch key from remote, unexpected " +
                        "error code: " +
                        result.result
                    );
                  }

                  return result.key;
                }
              });
              break;

            case 403:
              this.page = "auth";
              break;

            case 0:
              setTimeout(() => {
                this.tryInitialAuth();
              }, backendQueryRetryDelay);
              break;

            default:
              alert("Unexpected backend query status: " + result.result);
          }
        } catch (e) {
          this.loadErr = "Unable to initialize client application: " + e;
        }
      },
      async doAuth(privateKey) {
        let result = await this.requestAuth(privateKey);

        if (result.key) {
          this.key = result.key;
        }

        return result;
      },
      async requestAuth(privateKey) {
        let authKey =
          !privateKey || !this.key
            ? null
            : await this.getSocketAuthKey(privateKey, this.key);

        let h = await xhr.get(socksVerificationInterface, {
          "X-Key": authKey ? btoa(String.fromCharCode.apply(null, authKey)) : ""
        });

        let serverDate = h.getResponseHeader("Date");

        return {
          result: h.status,
          key: h.getResponseHeader("X-Key"),
          timeout: h.getResponseHeader("X-Timeout"),
          heartbeat: h.getResponseHeader("X-Heartbeat"),
          date: serverDate ? new Date(serverDate) : null,
          data: h.responseText,
          onlyAllowPresetRemotes:
            h.getResponseHeader("X-OnlyAllowPresetRemotes") === "yes"
        };
      },
      async submitAuth(passphrase) {
        this.authErr = "";

        try {
          let result = await this.doAuth(passphrase);

          switch (result.result) {
            case 200:
              this.executeHomeApp(result, {
                data: passphrase,
                fetch() {
                  return this.data;
                }
              });
              break;

            case 403:
              this.authErr = "Authentication has failed. Wrong passphrase?";
              break;

            default:
              this.authErr =
                "Unexpected backend query status: " + result.result;
          }
        } catch (e) {
          this.authErr = "Unable to authenticate: " + e;
        }
      },
      updateTabTitleInfo(tabs, updated) {
        if (tabs.length <= 0) {
          this.resetTitleInfo();

          return;
        }

        this.changeTitleInfo("(" + tabs.length + (updated ? "*" : "") + ")");
      },
      tabOpened(tabs) {
        this.tabUpdated(tabs);
      },
      tabClosed(tabs) {
        if (tabs.length > 0) {
          this.updateTabTitleInfo(tabs, this.tabUpdateIndicator !== null);

          return;
        }

        if (this.tabUpdateIndicator) {
          clearTimeout(this.tabUpdateIndicator);
          this.tabUpdateIndicator = null;
        }

        this.updateTabTitleInfo(tabs, false);
      },
      tabUpdated(tabs) {
        if (this.tabUpdateIndicator) {
          clearTimeout(this.tabUpdateIndicator);
          this.tabUpdateIndicator = null;
        }

        this.updateTabTitleInfo(tabs, true);

        this.tabUpdateIndicator = setTimeout(() => {
          this.tabUpdateIndicator = null;
          this.updateTabTitleInfo(tabs, false);
        }, updateIndicatorMaxDisplayTime);
      }
    }
  });
}

function initializeClient() {
  let landingRoot = document.getElementById("landing");

  if (!landingRoot) {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("Currently in Development environment");
  }

  window.addEventListener("unhandledrejection", function(e) {
    console.error("Error:", e);
  });

  window.addEventListener("error", function(e) {
    console.error("Error:", e);
  });

  landingRoot.parentNode.removeChild(landingRoot);

  let normalRoot = document.createElement("div");
  normalRoot.setAttribute("id", "app");
  normalRoot.innerHTML = mainTemplate;

  document.body.insertBefore(normalRoot, document.body.firstChild);

  startApp(normalRoot);
}

window.addEventListener("load", initializeClient);
document.addEventListener("load", initializeClient);
document.addEventListener("DOMContentLoaded", initializeClient);
