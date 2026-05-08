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

import Vue from "vue";
import "./app.css";
import Auth from "./auth.vue";
import { Colors as ControlColors } from "./commands/color.js";
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
import * as stream from "./stream/common.js";
import * as xhr from "./xhr.js";

/**
 * @file app.js
 * @description Entry point for the Sshwifty Vue application. Bootstraps the
 * root Vue instance, handles initial authentication, socket setup, viewport
 * tracking, and page/tab state transitions.
 */

/** @type {number} Milliseconds to wait before retrying a failed backend query. */
const backendQueryRetryDelay = 2000;

/**
 * @type {number} Maximum acceptable clock difference (ms) between the browser
 * and the Sshwifty server before showing a time-sync error.
 */
const maxTimeDiff = 30000;

/** @type {number} How long (ms) the tab-update asterisk indicator stays visible. */
const updateIndicatorMaxDisplayTime = 3000;

const mainTemplate = `
<home
  v-if="page == 'app'"
  :host-path="hostPath"
  :query="query"
  :connection="socket"
  :controls="controls"
  :commands="commands"
  :server-message="serverMessage"
  :preset-data="presetData.presets"
  :restricted-to-presets="presetData.restricted"
  :view-port="viewPort"
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
<loading class="app-error-message" v-else :error="loadErr"></loading>
`.trim();

/** @type {string} WebSocket backend path. */
const socksInterface = "/sshwifty/socket";
/** @type {string} HTTP verification endpoint used to obtain a session key. */
const socksVerificationInterface = socksInterface + "/verify";
/**
 * @type {number} Time bucket size (ms) used to truncate the current timestamp
 * before mixing it into the socket key, limiting key reuse windows.
 */
const socksKeyTimeTruncater = 100 * 1000;

/**
 * Creates and mounts the root Vue application instance onto `rootEl`.
 *
 * Initialises all reactive state (page routing, socket, viewport), attaches
 * global resize listeners, and kicks off the first authentication attempt.
 *
 * @param {HTMLElement} rootEl - The DOM element that Vue will be mounted onto.
 * @returns {void}
 */
function startApp(rootEl) {
  const pageTitle = document.title;

  let uiControlColors = new ControlColors();

  /**
   * Returns the current time bucket as a string for use as an HMAC mixer.
   *
   * The timestamp is truncated to `socksKeyTimeTruncater` millisecond buckets so
   * that socket keys rotate periodically without requiring sub-millisecond precision.
   *
   * @private
   * @returns {string} Truncated timestamp bucket as a decimal string.
   */
  function getCurrentKeyMixer() {
    return Number(
      Math.trunc(new Date().getTime() / socksKeyTimeTruncater),
    ).toString();
  }

  /**
   * Derives a 16-byte AES key for the WebSocket stream by HMAC-SHA-512-ing the
   * private key with the current time bucket, then truncating to 16 bytes.
   *
   * @private
   * @param {string} privateKey - The raw passphrase or server-supplied key string.
   * @returns {Promise<Uint8Array>} Resolved with the 16-byte derived key.
   */
  async function buildSocketKey(privateKey) {
    return new Uint8Array(
      await cipher.hmac512(
        stream.buildBufferFromString(privateKey),
        stream.buildBufferFromString(getCurrentKeyMixer()),
      ),
    ).slice(0, 16);
  }

  new Vue({
    el: rootEl,
    components: {
      loading: Loading,
      auth: Auth,
      home: Home,
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
        serverMessage: "",
        presetData: {
          presets: new Presets([]),
          restricted: false,
        },
        authErr: "",
        loadErr: "",
        socket: null,
        controls: new Controls([
          new telnetctl.Telnet(uiControlColors),
          new sshctl.SSH(uiControlColors),
        ]),
        commands: new Commands([new telnet.Command(), new ssh.Command()]),
        tabUpdateIndicator: null,
        viewPort: {
          dim: {
            width: 0,
            height: 0,
            renew(width, height) {
              this.width = width;
              this.height = height;
            },
          },
        },
        viewPortUpdaters: {
          width: 0,
          height: 0,
          dimResizer: null,
        },
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
      },
    },
    mounted() {
      const self = this;

      self.tryInitialAuth();

      self.viewPortUpdaters.dimResizer = () => {
        self.viewPortUpdaters.height = window.innerHeight;
        self.viewPortUpdaters.width = window.innerWidth;

        self.$nextTick(() => {
          self.viewPort.dim.renew(
            self.viewPortUpdaters.width,
            self.viewPortUpdaters.height,
          );
        });
      };

      window.addEventListener("resize", self.viewPortUpdaters.dimResizer);
    },
    beforeDestroy() {
      window.removeEventListener("resize", self.viewPortUpdaters.dimResizer);
    },
    methods: {
      /**
       * Prepends status information to the browser tab title.
       *
       * @param {string} newTitleInfo - Text to prepend (e.g. "(3*)").
       * @returns {void}
       */
      changeTitleInfo(newTitleInfo) {
        document.title = newTitleInfo + " " + pageTitle;
      },
      /**
       * Restores the original page title, removing any prepended status text.
       *
       * @returns {void}
       */
      resetTitleInfo() {
        document.title = pageTitle;
      },
      /**
       * Updates the browser URL hash without a full page navigation.
       *
       * @param {string} newHash - The new hash value (without the leading `#`).
       * @returns {void}
       */
      changeURLHash(newHash) {
        window.location.hash = newHash;
      },
      /**
       * Returns whether the application is currently in an error state.
       *
       * @returns {boolean} `true` if either `authErr` or `loadErr` is non-empty.
       */
      isErrored() {
        return this.authErr.length > 0 || this.loadErr.length > 0;
      },
      /**
       * Derives a 32-byte HMAC-SHA-512 auth key from the private key and the
       * current time truncated to 100-second buckets.
       *
       * @param {string} privateKey - The user-supplied passphrase.
       * @returns {Promise<Uint8Array>} Resolved with the 32-byte auth key.
       */
      async getSocketAuthKey(privateKey) {
        const enc = new TextEncoder(),
          rTime = Number(Math.trunc(new Date().getTime() / 100000));

        var finalKey = "";

        if (privateKey.length <= 0) {
          finalKey = "DEFAULT VERIFY KEY";
        } else {
          finalKey = privateKey;
        }

        return new Uint8Array(
          await cipher.hmac512(enc.encode(finalKey), enc.encode(rTime)),
        ).slice(0, 32);
      },
      /**
       * Builds the WebSocket and keep-alive HTTP URLs for the backend socket
       * endpoint, automatically choosing `wss://` when the page is served over HTTPS.
       *
       * @returns {{ webSocket: string, keepAlive: string }} URL pair for the socket
       *   and its HTTP keep-alive counterpart.
       */
      buildBackendSocketURLs() {
        let r = {
          webSocket: "",
          keepAlive: "",
        };

        switch (location.protocol) {
          case "https:":
            r.webSocket = "wss://";
            break;

          default:
            r.webSocket = "ws://";
        }

        r.webSocket += location.host + socksInterface;
        r.keepAlive = location.protocol + "//" + location.host + socksInterface;

        return r;
      },
      /**
       * Constructs a new {@link Socket} using the backend URLs, session key, and
       * server-supplied timing parameters.
       *
       * @param {object} key - Key provider object with a `fetch()` method that
       *   returns a `Promise<Uint8Array>` of the raw AES key.
       * @param {number} dialTimeout - Connection timeout in seconds (converted to ms internally).
       * @param {number} heartbeatInterval - Echo heartbeat interval in seconds.
       * @returns {Socket} Configured socket instance ready to be passed to the home view.
       */
      buildSocket(key, dialTimeout, heartbeatInterval) {
        return new Socket(
          this.buildBackendSocketURLs(),
          key,
          dialTimeout * 1000,
          heartbeatInterval * 1000,
        );
      },
      /**
       * Transitions the application to the `app` page by parsing the auth
       * response, initialising presets, and building the socket.
       *
       * @param {{ data: string, onlyAllowPresetRemotes: boolean, timeout: number, heartbeat: number }} authResult
       *   The raw XHR auth response object.
       * @param {object} key - Key provider with a `fetch()` method.
       * @returns {void}
       */
      executeHomeApp(authResult, key) {
        let authData = JSON.parse(authResult.data);
        this.serverMessage = authData.server_message
          ? authData.server_message
          : "";
        this.presetData = {
          presets: new Presets(authData.presets ? authData.presets : []),
          restricted: authResult.onlyAllowPresetRemotes,
        };
        this.socket = this.buildSocket(
          key,
          authResult.timeout,
          authResult.heartbeat,
        );
        this.page = "app";
      },
      /**
       * Performs authentication and stores the server-returned key for later use.
       *
       * Delegates the actual HTTP request to `requestAuth`, then persists the
       * `X-Key` header value in `this.key` when the server returns one.
       *
       * @param {string} privateKey - The user passphrase, or an empty string for
       *   unauthenticated (no-passphrase) mode.
       * @returns {Promise<object>} Auth result object (see `requestAuth`).
       */
      async doAuth(privateKey) {
        let result = await this.requestAuth(privateKey);

        if (result.key) {
          this.key = result.key;
        }

        return result;
      },
      /**
       * Issues a GET request to the verification endpoint and returns the parsed
       * response headers and body.
       *
       * When a non-empty `privateKey` and a previously stored `this.key` are
       * present, an HMAC auth token is derived and sent in the `X-Key` header.
       *
       * @param {string} privateKey - Passphrase used to compute the HMAC token,
       *   or an empty string to skip token computation.
       * @returns {Promise<{ result: number, key: string|null, timeout: string|null,
       *   heartbeat: string|null, date: Date|null, data: string,
       *   onlyAllowPresetRemotes: boolean }>}
       *   Parsed auth response with HTTP status and relevant headers.
       */
      async requestAuth(privateKey) {
        let authKey =
          !privateKey || !this.key
            ? null
            : await this.getSocketAuthKey(privateKey);

        let h = await xhr.get(socksVerificationInterface, {
          "X-Key": authKey
            ? btoa(String.fromCharCode.apply(null, authKey))
            : "",
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
            h.getResponseHeader("X-OnlyAllowPresetRemotes") === "yes",
        };
      },
      /**
       * Performs the initial authentication attempt on page load.
       *
       * Handles clock-skew detection, retries on network failure (status 0),
       * redirects to the passphrase form on 403, and boots the home app on 200.
       * Sets `this.loadErr` on unrecoverable failures.
       *
       * @returns {Promise<void>}
       */
      async tryInitialAuth() {
        try {
          let result = await this.doAuth("");

          if (result.date) {
            let serverRespondTime = result.date,
              serverRespondTimestamp = serverRespondTime.getTime(),
              clientCurrent = new Date(),
              clientTimestamp = clientCurrent.getTime(),
              timeDiff = Math.abs(serverRespondTimestamp - clientTimestamp);

            if (timeDiff > maxTimeDiff) {
              this.loadErr =
                "The datetime difference between current client " +
                "and the Sshwifty server is beyond the operational tolerance." +
                "\r\n\r\n" +
                "The server time was " +
                serverRespondTime +
                ", and the client time was " +
                clientCurrent +
                ", resulted a " +
                timeDiff +
                "ms time difference, exceeding the " +
                "limitation of " +
                maxTimeDiff +
                "ms.\r\n\r\n" +
                "Try reload the page, see if the problem persists. And if " +
                "it did, please make sure both the server and the client are " +
                "having the correct time settings";

              return;
            }
          }

          let self = this;
          switch (result.result) {
            case 200:
              this.executeHomeApp(result, {
                async fetch() {
                  let result = await self.doAuth("");

                  if (result.result !== 200) {
                    throw new Error(
                      "Unable to fetch key from remote, unexpected " +
                        "error code: " +
                        result.result,
                    );
                  }

                  return await buildSocketKey(atob(result.key) + "+");
                },
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
      /**
       * Handles a user-submitted passphrase from the auth form.
       *
       * Clears any previous auth error, attempts authentication, and on success
       * transitions to the home app. Sets `this.authErr` on 403 or other errors.
       *
       * @param {string} passphrase - The passphrase entered by the user.
       * @returns {Promise<void>}
       */
      async submitAuth(passphrase) {
        this.authErr = "";

        try {
          let result = await this.doAuth(passphrase);

          let self = this;
          switch (result.result) {
            case 200:
              this.executeHomeApp(result, {
                async fetch() {
                  let result = await self.doAuth(passphrase);

                  if (result.result !== 200) {
                    throw new Error(
                      "Unable to fetch key from remote, unexpected " +
                        "error code: " +
                        result.result,
                    );
                  }

                  return await buildSocketKey(
                    atob(result.key) + "+" + passphrase,
                  );
                },
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
      /**
       * Updates the browser tab title to reflect the open tab count and whether
       * any tab has unseen activity.
       *
       * When there are no open tabs, the original page title is restored.
       *
       * @param {Array} tabs - Current array of open session tabs.
       * @param {boolean} updated - Whether to append the `*` update indicator.
       * @returns {void}
       */
      updateTabTitleInfo(tabs, updated) {
        if (tabs.length <= 0) {
          this.resetTitleInfo();

          return;
        }

        this.changeTitleInfo("(" + tabs.length + (updated ? "*" : "") + ")");
      },
      /**
       * Called when a new session tab is opened.
       *
       * Delegates to `tabUpdated` so the title reflects the new count and
       * triggers the update indicator.
       *
       * @param {Array} tabs - Updated array of all open session tabs.
       * @returns {void}
       */
      tabOpened(tabs) {
        this.tabUpdated(tabs);
      },
      /**
       * Called when a session tab is closed.
       *
       * Clears any active update indicator when the last tab is closed.
       *
       * @param {Array} tabs - Updated array of remaining open session tabs.
       * @returns {void}
       */
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
      /**
       * Called when a session tab receives new data.
       *
       * Resets the update indicator timer and shows the `*` suffix in the page
       * title for `updateIndicatorMaxDisplayTime` milliseconds.
       *
       * @param {Array} tabs - Current array of open session tabs.
       * @returns {void}
       */
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
      },
    },
  });
}

/**
 * Bootstraps the Sshwifty client application.
 *
 * Locates the `#landing` placeholder element, removes it, injects the Vue
 * mount point with the root template, and calls {@link startApp}.  Also
 * attaches global `unhandledrejection` and `error` listeners for debugging.
 *
 * @returns {void}
 */
function initializeClient() {
  let landingRoot = document.getElementById("landing");

  if (!landingRoot) {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("Currently in Development environment");
  }

  window.addEventListener("unhandledrejection", function (e) {
    console.error("Error:", e);
  });

  window.addEventListener("error", function (e) {
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
