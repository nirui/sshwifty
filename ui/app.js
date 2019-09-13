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

import "./common.css";
import "./app.css";
import "./landing.css";

import { Socket } from "./socket.js";

import Vue from "vue";
import Home from "./home.vue";
import Auth from "./auth.vue";
import Loading from "./loading.vue";

import { Commands } from "./commands/commands.js";
import * as ssh from "./commands/ssh.js";
import * as telnet from "./commands/telnet.js";

import { Controls } from "./commands/controls.js";
import { Color as ControlColor } from "./commands/color.js";
import * as telnetctl from "./control/telnet.js";
import * as sshctl from "./control/ssh.js";

import * as xhr from "./xhr.js";
import * as cipher from "./crypto.js";

const backendQueryRetryDelay = 2000;

const maxTimeDiff = 30000;

const mainTemplate = `
<home
  v-if="page == 'app'"
  :host-path="hostPath"
  :query="query"
  :connection="socket"
  :controls="controls"
  :commands="commands"
  @navigate-to="changeURLHash"></home>
<auth
  v-else-if="page == 'auth'"
  :error="authErr"
  @auth="submitAuth"
></auth>
<loading v-else :error="loadErr"></loading>
`.trim();

function startApp(rootEl) {
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
        authErr: "",
        loadErr: "",
        socket: null,
        controls: new Controls([
          new telnetctl.Telnet(uiControlColor),
          new sshctl.SSH(uiControlColor)
        ]),
        commands: new Commands([new telnet.Command(), new ssh.Command()])
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
      changeURLHash(newHash) {
        window.location.hash = newHash;
      },
      isErrored() {
        return this.authErr.length > 0 || this.loadErr.length > 0;
      },
      async getSocketAuthKey(privateKey, randomKey) {
        const enc = new TextEncoder("utf-8");

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

        r += location.host + "/socket";

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
              this.socket = this.buildSocket(
                {
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
                },
                result.timeout,
                result.heartbeat
              );
              this.page = "app";
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

        let h = await xhr.head("/socket", {
          "X-Key": authKey ? btoa(String.fromCharCode.apply(null, authKey)) : ""
        });

        let serverDate = h.getResponseHeader("Date");

        return {
          result: h.status,
          key: h.getResponseHeader("X-Key"),
          timeout: h.getResponseHeader("X-Timeout"),
          heartbeat: h.getResponseHeader("X-Heartbeat"),
          date: serverDate ? new Date(serverDate) : null
        };
      },
      async submitAuth(passphrase) {
        this.authErr = "";

        try {
          let result = await this.doAuth(passphrase);

          switch (result.result) {
            case 200:
              this.socket = this.buildSocket(
                {
                  data: passphrase,
                  fetch() {
                    return this.data;
                  }
                },
                result.timeout,
                result.heartbeat
              );
              this.page = "app";
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

    window.addEventListener("unhandledrejection", function(e) {
      console.error("Error:", e);
    });

    window.addEventListener("error", function(e) {
      console.error("Error:", e);
    });
  }

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
