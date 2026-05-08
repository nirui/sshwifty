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
  <div class="screen-console">
    <div
      class="console-console"
      :style="'font-family: ' + typefaces + ', inherit'"
    >
      <h2 style="display: none">Console</h2>

      <div class="console-loading">
        <div class="console-loading-frame">
          <div class="console-loading-icon"></div>
          <div class="console-loading-message">Initializing console ...</div>
        </div>
      </div>
    </div>

    <!--
      Tell you this: the background transparent below is probably the most
      important transparent setting in the entire application. Make sure user
      can see through it so they can operate the console while keep the toolbar
      open.
    -->
    <div
      v-if="toolbar"
      class="console-toolbar"
      :style="'background-color: ' + control.color() + 'ee'"
    >
      <h2 style="display: none">Tool bar</h2>

      <div class="console-toolbar-group console-toolbar-group-left">
        <div class="console-toolbar-item">
          <h3 class="tb-title">Text size</h3>

          <ul class="lst-nostyle">
            <li>
              <a class="tb-item" href="javascript:;" @click="fontSizeUp">
                <span
                  class="tb-key-icon tb-key-resize-icon icon icon-keyboardkey1 icon-iconed-bottom1"
                >
                  <i>+</i>
                  Increase
                </span>
              </a>
            </li>
            <li>
              <a class="tb-item" href="javascript:;" @click="fontSizeDown">
                <span
                  class="tb-key-icon tb-key-resize-icon icon icon-keyboardkey1 icon-iconed-bottom1"
                >
                  <i>-</i>
                  Decrease
                </span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="console-toolbar-group console-toolbar-group-main">
        <div
          v-for="(keyType, keyTypeIdx) in screenKeys"
          :key="keyTypeIdx"
          class="console-toolbar-item"
        >
          <h3 class="tb-title">{{ keyType.title }}</h3>

          <ul class="hlst lst-nostyle">
            <li v-for="(key, keyIdx) in keyType.keys" :key="keyIdx">
              <a
                class="tb-item"
                href="javascript:;"
                @click="sendSpecialKey(key[1])"
                v-html="$options.filters.specialKeyHTML(key[0])"
              ></a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import FontFaceObserver from "fontfaceobserver";
import { Terminal } from "@xterm/xterm";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { isNumber } from "../commands/common.js";
import { consoleScreenKeys } from "./screen_console_keys.js";

import "./screen_console.css";
import "@xterm/xterm/css/xterm.css";

/**
 * @fileoverview xterm.js-backed terminal emulator screen component.
 *
 * Manages the full lifecycle of an xterm.js `Terminal` instance: font loading
 * (with fallback and background retry), WebGL acceleration (when available),
 * an async data-receiver loop, and a floating toolbar for special-key injection
 * and font-size adjustment.
 *
 * The component communicates with the backend over the `control` prop interface
 * which must expose `send(data)`, `sendBinary(data)`, `receive()`, `resize({rows,cols})`,
 * `echo()`, and `color()`.
 *
 * @prop {boolean} active    - When true, the terminal is focused and fitted to the viewport.
 * @prop {Object}  control   - Backend control interface for the open connection.
 * @prop {Object}  change    - Indicator object watched for viewport-change triggers (deep).
 * @prop {boolean} toolbar   - When true, the special-key toolbar is rendered.
 * @prop {Object}  viewPort  - Viewport size descriptor; deep-watched to trigger a refit.
 *
 * @emits warning - A non-fatal warning occurred. Payload: `{text: string, toDismiss: boolean}`.
 * @emits info    - An informational message. Payload: `{text: string, toDismiss: boolean}`.
 * @emits updated - Emitted each time new data is written to the terminal.
 * @emits stopped - The receiver loop ended. Payload: `{Error}` the stop reason.
 */

/** @type {string} Preferred monospace font families loaded from a remote CDN. */
const termTypeFaces = "Hack, PureNerdFont";
/** @type {string} Local fallback font family used while remote fonts are loading. */
const termFallbackTypeFace = '"Cascadia Code" , monospace';
/** @type {number} Milliseconds to wait for each remote font before falling back. */
const termTypeFaceLoadTimeout = 3000;
/** @type {string} Warning message emitted when the remote font is unavailable on first attempt. */
const termTypeFaceLoadError =
  "Remote font " +
  termTypeFaces +
  " is unavailable, using " +
  termFallbackTypeFace +
  " instead until the remote font is loaded";
/** @type {number} Default terminal font size in pixels. */
const termDefaultFontSize = 16;
/** @type {number} Minimum allowed font size in pixels. */
const termMinFontSize = 8;
/** @type {number} Maximum allowed font size in pixels. */
const termMaxFontSize = 36;

/**
 * Detects whether the current browser environment supports WebGL and WebGL2.
 *
 * Checks for the global `WebGLRenderingContext` and `WebGL2RenderingContext`
 * constructors and then attempts to obtain contexts from a temporary canvas.
 * Returns false defensively on any exception (e.g. headless environments).
 *
 * @private
 * @returns {boolean|CanvasRenderingContext2D} Truthy when WebGL is available, false otherwise.
 */
function webglSupported() {
  try {
    if (typeof window !== "object") {
      return false;
    }
    if (typeof window.WebGLRenderingContext !== "function") {
      return false;
    }
    if (typeof window.WebGL2RenderingContext !== "function") {
      return false;
    }
    return (
      document.createElement("canvas").getContext("webgl") &&
      document.createElement("canvas").getContext("webgl2")
    );
  } catch {
    // ignore: WebGL not available
  }
  return false;
}

/**
 * Thin wrapper around an xterm.js `Terminal` that binds it to the connection
 * `control` interface and adds font-size management, fit/refit, and safe
 * closed-state guards on every operation.
 *
 * @private
 */
class Term {
  /**
   * Creates the xterm.js Terminal, loads the FitAddon, and wires data/binary/
   * key/resize event handlers to the control interface.
   *
   * Resize events are debounced by `resizeDelayInterval` ms to avoid flooding
   * the backend with intermediate dimensions while the user resizes the window.
   *
   * @param {Object} control - Connection control interface exposing `send`,
   *   `sendBinary`, `echo`, `resize`, and `color` methods.
   */
  constructor(control) {
    const resizeDelayInterval = 500;

    this.control = control;
    this.closed = false;
    this.fontSize = termDefaultFontSize;
    this.term = new Terminal({
      allowProposedApi: true,
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: termTypeFaces + ", " + termFallbackTypeFace,
      fontSize: this.fontSize,
      letterSpacing: 1,
      lineHeight: 1.3,
      logLevel: process.env.NODE_ENV === "development" ? "info" : "off",
      theme: {
        background: this.control.color(),
      },
    });
    this.fit = new FitAddon();

    this.term.onData((data) => {
      if (this.closed) {
        return;
      }
      this.control.send(data);
    });

    this.term.onBinary((data) => {
      if (this.closed) {
        return;
      }
      this.control.sendBinary(data);
    });

    this.term.onKey((ev) => {
      if (this.closed) {
        return;
      }
      if (!this.control.echo()) {
        return;
      }
      const printable =
        !ev.domEvent.altKey &&
        !ev.domEvent.altGraphKey &&
        !ev.domEvent.ctrlKey &&
        !ev.domEvent.metaKey;
      switch (ev.domEvent.key) {
        case "Enter":
          ev.domEvent.preventDefault();
          this.writeStr("\r\n");
          break;
        case "Backspace":
          ev.domEvent.preventDefault();
          this.writeStr("\b \b");
          break;
        default:
          if (printable) {
            ev.domEvent.preventDefault();
            this.writeStr(ev.key);
          }
      }
    });

    let resizeDelay = null,
      oldRows = 0,
      oldCols = 0;

    this.term.onResize((dim) => {
      if (this.closed) {
        return;
      }
      if (dim.cols === oldCols && dim.rows === oldRows) {
        return;
      }
      oldRows = dim.rows;
      oldCols = dim.cols;
      if (resizeDelay !== null) {
        clearTimeout(resizeDelay);
        resizeDelay = null;
      }
      resizeDelay = setTimeout(() => {
        resizeDelay = null;
        if (!isNumber(dim.cols) || !isNumber(dim.rows)) {
          return;
        }
        if (!dim.cols || !dim.rows) {
          return;
        }
        this.control.resize({
          rows: dim.rows,
          cols: dim.cols,
        });
      }, resizeDelayInterval);
    });
  }

  /**
   * Mounts the terminal into `root`, loads all addons, and performs an initial
   * refit. No-op when already closed.
   *
   * Attempts to load the WebglAddon for GPU-accelerated rendering; silently
   * falls back to the canvas renderer if loading fails.
   *
   * @param {HTMLElement} root - The container element to render the terminal into.
   * @returns {void}
   */
  init(root) {
    if (this.closed) {
      return;
    }
    this.term.open(root);
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon());
    this.term.loadAddon(new Unicode11Addon());
    try {
      if (webglSupported()) {
        this.term.loadAddon(new WebglAddon());
      }
    } catch {
      // ignore: WebGL addon failed to load
    }
    this.term.unicode.activeVersion = "11";
    this.refit();
  }

  /**
   * Dispatches a synthetic DOM event into the xterm.js textarea input element.
   *
   * Used by the toolbar to inject special keyboard events (function keys,
   * control sequences, etc.) that cannot easily be typed on mobile devices.
   * Errors are silently swallowed to avoid disrupting the UI.
   *
   * @param {Event} event - The DOM event to dispatch.
   * @returns {void}
   */
  dispatch(event) {
    if (this.closed) {
      return;
    }
    try {
      this.term.textarea.dispatchEvent(event);
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  /**
   * Writes a UTF-8 string to the terminal. No-op when closed.
   *
   * @param {string} d - The string data to write.
   * @returns {void}
   */
  writeStr(d) {
    if (this.closed) {
      return;
    }
    try {
      this.term.write(d);
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  /**
   * Updates the terminal's font family and triggers a refit. No-op when closed.
   *
   * @param {string} value - CSS font-family string to apply.
   * @returns {void}
   */
  setFont(value) {
    if (this.closed) {
      return;
    }
    this.term.options.fontFamily = value;
    this.refit();
  }

  /**
   * Increases the font size by 2 px up to `termMaxFontSize`, then refits.
   * No-op when closed or already at maximum.
   *
   * @returns {void}
   */
  fontSizeUp() {
    if (this.closed) {
      return;
    }
    if (this.fontSize >= termMaxFontSize) {
      return;
    }
    this.fontSize += 2;
    this.term.options.fontSize = this.fontSize;
    this.refit();
  }

  /**
   * Decreases the font size by 2 px down to `termMinFontSize`, then refits.
   * No-op when closed or already at minimum.
   *
   * @returns {void}
   */
  fontSizeDown() {
    if (this.closed) {
      return;
    }
    if (this.fontSize <= termMinFontSize) {
      return;
    }
    this.fontSize -= 2;
    this.term.options.fontSize = this.fontSize;
    this.refit();
  }

  /**
   * Focuses the terminal and triggers a refit. No-op when closed.
   *
   * @returns {void}
   */
  focus() {
    if (this.closed) {
      return;
    }
    try {
      this.term.focus();
      this.refit();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  /**
   * Blurs (removes focus from) the terminal. No-op when closed.
   *
   * @returns {void}
   */
  blur() {
    if (this.closed) {
      return;
    }
    try {
      this.term.blur();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  /**
   * Recalculates the terminal dimensions to fill its container element.
   * No-op when closed; errors are silently ignored (e.g. during hidden-state transitions).
   *
   * @returns {void}
   */
  refit() {
    if (this.closed) {
      return;
    }
    try {
      this.fit.fit();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  /**
   * Returns whether the terminal has been destroyed.
   *
   * @returns {boolean} True after `destroy()` has been called.
   */
  destroyed() {
    return this.closed;
  }

  /**
   * Permanently disposes the xterm.js Terminal and marks the instance as closed.
   * All subsequent method calls become no-ops. Safe to call multiple times.
   *
   * @returns {void}
   */
  destroy() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.term.dispose();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }
}

// So it turns out, display: none + xterm.js == trouble, so I changed this
// to a visibility + position: absolute appoarch. Problem resolved, and I
// like to keep it that way.

export default {
  filters: {
    /**
     * Converts a key label string into an HTML fragment that wraps each
     * segment of a `+`-delimited chord in a keyboard-key icon `<span>`.
     *
     * Example: `"Ctrl+C"` → `<span ...>Ctrl</span>+<span ...>C</span>`.
     *
     * @param {string} key - Human-readable key label, e.g. `"Ctrl+Alt+Del"`.
     * @returns {string} HTML string safe for use with `v-html`.
     */
    specialKeyHTML(key) {
      const head = '<span class="tb-key-icon icon icon-keyboardkey1">',
        tail = "</span>";

      return head + key.split("+").join(tail + "+" + head) + tail;
    },
  },
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    control: {
      type: Object,
      default: () => null,
    },
    change: {
      type: Object,
      default: () => null,
    },
    toolbar: {
      type: Boolean,
      default: false,
    },
    viewPort: {
      type: Object,
      default: () => null,
    },
  },
  /**
   * @returns {{
   *   screenKeys: Array,
   *   term: Term,
   *   typefaces: string,
   *   runner: Promise|null,
   *   eventHandlers: {keydown: null, keyup: null}
   * }}
   *   `screenKeys` — grouped toolbar key descriptors from `consoleScreenKeys`.
   *   `term` — the active `Term` wrapper (created eagerly from the `control` prop).
   *   `typefaces` — CSS font-family string shown in the console element style.
   *   `runner` — promise for the active data-receiver loop; null when not running.
   *   `eventHandlers` — reserved slots for global keyboard handler references (unused currently).
   */
  data() {
    return {
      screenKeys: consoleScreenKeys,
      term: new Term(this.control),
      typefaces: termTypeFaces,
      runner: null,
      eventHandlers: {
        keydown: null,
        keyup: null,
      },
    };
  },
  watch: {
    active(newVal, _oldVal) {
      this.triggerActive(newVal);
    },
    change: {
      handler() {
        if (!this.active) {
          return;
        }

        this.fit();
      },
      deep: true,
    },
    viewPort: {
      handler() {
        if (!this.active) {
          return;
        }

        this.fit();
      },
      deep: true,
    },
  },
  async mounted() {
    await this.init();
  },
  beforeDestroy() {
    this.deinit();
  },
  methods: {
    /**
     * Attempts to load all listed remote font families (normal and bold weights)
     * using FontFaceObserver and returns a promise that resolves when all are ready.
     *
     * @param {string} typefaces - Comma-separated CSS font-family names to observe.
     * @param {number} timeout - Milliseconds to wait per font before rejecting.
     * @returns {Promise<void[]>} Resolves when all font faces have loaded.
     */
    loadRemoteFont(typefaces, timeout) {
      const tfs = typefaces.split(",");
      let observers = [];
      for (let v in tfs) {
        observers.push(new FontFaceObserver(tfs[v].trim()).load(null, timeout));
        observers.push(
          new FontFaceObserver(tfs[v].trim(), {
            weight: "bold",
          }).load(null, timeout),
        );
      }
      return Promise.all(observers);
    },
    /**
     * Retries `loadRemoteFont` indefinitely on failure, waiting `timeout` ms
     * between each attempt, and calls `onSuccess` with the result on first success.
     *
     * Used to switch the terminal back to the preferred font after it initially
     * fell back to a local typeface.
     *
     * @param {string} typefaces - Comma-separated CSS font-family names.
     * @param {number} timeout - Retry interval in milliseconds.
     * @param {function(void[]): void} onSuccess - Callback invoked on successful load.
     * @returns {Promise<void>}
     */
    async retryLoadRemoteFont(typefaces, timeout, onSuccess) {
      const self = this;
      for (;;) {
        try {
          onSuccess(await self.loadRemoteFont(typefaces, timeout));
          return;
        } catch (e) {
          // Wait and then retry
          await new Promise((res) => {
            window.setTimeout(() => {
              res();
            }, timeout);
          });
        }
      }
    },
    /**
     * Loads remote fonts and then initialises the xterm.js terminal in `root`.
     *
     * If the remote font fails to load on the first attempt, falls back to
     * `termFallbackTypeFace`, emits a `warning` via `callbacks.warn`, and
     * starts a background retry loop that switches back when the font loads.
     *
     * @param {HTMLElement} root - Container element for the terminal.
     * @param {{warn: function(string, boolean): void, info: function(string, boolean): void}} callbacks
     *   Notification callbacks — `warn(msg, toDismiss)` and `info(msg, toDismiss)`.
     * @returns {Promise<void>}
     */
    async openTerm(root, callbacks) {
      const self = this;
      try {
        await self.loadRemoteFont(termTypeFaces, termTypeFaceLoadTimeout);
        if (self.term.destroyed()) {
          return;
        }
        root.innerHTML = "";
        self.term.init(root);
        return;
      } catch (e) {
        // Ignore
      }
      if (self.term.destroyed()) {
        return;
      }
      root.innerHTML = "";
      callbacks.warn(termTypeFaceLoadError, false);
      self.term.setFont(termFallbackTypeFace);
      self.term.init(root);
      self.retryLoadRemoteFont(termTypeFaces, termTypeFaceLoadTimeout, () => {
        if (self.term.destroyed()) {
          return;
        }
        self.term.setFont(termTypeFaces);
        callbacks.warn(termTypeFaceLoadError, true);
      });
    },
    /**
     * Activates or deactivates the terminal based on a boolean flag.
     *
     * @param {boolean} active - True to activate (focus + fit), false to deactivate (blur).
     * @returns {void}
     */
    triggerActive(active) {
      active ? this.activate() : this.deactivate();
    },
    /**
     * Full component initialisation: opens the terminal, triggers active state,
     * and starts the data-receiver loop.
     *
     * @emits warning - If the remote font could not be loaded immediately.
     * @emits info    - Reserved for future informational messages.
     * @returns {Promise<void>}
     */
    async init() {
      let self = this;

      await self.openTerm(
        self.$el.getElementsByClassName("console-console")[0],
        {
          warn(msg, toDismiss) {
            self.$emit("warning", {
              text: msg,
              toDismiss: toDismiss,
            });
          },
          info(msg, toDismiss) {
            self.$emit("info", {
              text: msg,
              toDismiss: toDismiss,
            });
          },
        },
      );

      if (self.term.destroyed()) {
        return;
      }

      self.triggerActive(this.active);
      self.runRunner();
    },
    /**
     * Tears down the component: stops the receiver loop, deactivates, and destroys
     * the xterm.js terminal instance.
     *
     * @returns {Promise<void>}
     */
    async deinit() {
      await this.closeRunner();
      await this.deactivate();
      this.term.destroy();
    },
    /**
     * Triggers a terminal refit to match the current container dimensions.
     *
     * @returns {void}
     */
    fit() {
      this.term.refit();
    },
    /**
     * Focuses the terminal and refits it to the container.
     *
     * @returns {void}
     */
    activate() {
      this.term.focus();
      this.fit();
    },
    /**
     * Removes focus from the terminal.
     *
     * @returns {Promise<void>}
     */
    async deactivate() {
      this.term.blur();
    },
    /**
     * Starts the async receiver loop that reads data from `control.receive()`
     * and writes it to the terminal. Emits `updated` after each write and
     * `stopped` with the error when the loop ends.
     *
     * No-op if the runner is already active.
     *
     * @returns {void}
     */
    runRunner() {
      if (this.runner !== null) {
        return;
      }
      let self = this;
      this.runner = (async () => {
        try {
          for (;;) {
            if (self.term.destroyed()) {
              break;
            }
            self.term.writeStr(await this.control.receive());
            self.$emit("updated");
          }
        } catch (e) {
          self.$emit("stopped", e);
        }
      })();
    },
    /**
     * Awaits the running receiver loop and clears the `runner` reference.
     *
     * Safe to call when no runner is active (no-op).
     *
     * @returns {Promise<void>}
     */
    async closeRunner() {
      if (this.runner === null) {
        return;
      }

      let runner = this.runner;
      this.runner = null;

      await runner;
    },
    /**
     * Injects a special key into the terminal by dispatching synthetic
     * `keydown` and `keyup` events.
     *
     * Used by the on-screen toolbar to send function keys, control sequences,
     * and navigation keys that are difficult to type on mobile devices.
     *
     * @param {KeyboardEventInit} key - The KeyboardEvent init dict describing the key to send.
     * @returns {void}
     */
    sendSpecialKey(key) {
      if (!this.term) {
        return;
      }

      this.term.dispatch(new KeyboardEvent("keydown", key));
      this.term.dispatch(new KeyboardEvent("keyup", key));
    },
    /**
     * Increases the terminal font size by 2 px (delegated to `Term.fontSizeUp`).
     *
     * @returns {void}
     */
    fontSizeUp() {
      this.term.fontSizeUp();
    },
    /**
     * Decreases the terminal font size by 2 px (delegated to `Term.fontSizeDown`).
     *
     * @returns {void}
     */
    fontSizeDown() {
      this.term.fontSizeDown();
    },
  },
};
</script>
