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
  <div class="screen-console">
    <div
      class="console-console"
      style="top: 0; right: 0; left: 0; bottom: 0; padding： 0; margin: 0; z-index: 0; position: absolute; overflow: hidden"
    >
      <h2 style="display:none;">Console</h2>
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
      :style="'background-color: ' + control.activeColor() + 'ee'"
    >
      <h2 style="display:none;">Tool bar</h2>

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
</template>

<script>
import { Terminal } from "xterm";
import { WebLinksAddon } from "xterm-addon-web-links";
import { FitAddon } from "xterm-addon-fit";
import { isNumber } from "../commands/common.js";
import { consoleScreenKeys } from "./screen_console_keys.js";

import "./screen_console.css";
import "xterm/css/xterm.css";

class Term {
  constructor(control) {
    const resizeDelayInterval = 500;

    this.closed = false;
    this.term = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: "block",
      logLevel: process.env.NODE_ENV === "development" ? "info" : "off"
    });
    this.fit = new FitAddon();

    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon());

    this.term.setOption("theme", {
      background: control.activeColor()
    });

    this.term.onData(data => {
      if (this.closed) {
        return;
      }

      control.send(data);
    });

    this.term.onKey(ev => {
      if (this.closed) {
        return;
      }

      if (!control.echo()) {
        return;
      }

      const printable =
        !ev.domEvent.altKey &&
        !ev.domEvent.altGraphKey &&
        !ev.domEvent.ctrlKey &&
        !ev.domEvent.metaKey;

      switch (ev.domEvent.key.toLowerCase()) {
        case "enter":
          ev.domEvent.preventDefault();
          this.writeStr("\r\n");
          break;

        case "backspace":
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

    this.term.onResize(dim => {
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
        if (!isNumber(dim.cols) || !isNumber(dim.rows)) {
          return;
        }

        if (!dim.cols || !dim.rows) {
          return;
        }

        control.resize({
          rows: dim.rows,
          cols: dim.cols
        });

        resizeDelay = null;
      }, resizeDelayInterval);
    });
  }

  init(root, callbacks) {
    this.term.open(root);

    this.term.textarea.addEventListener("focus", callbacks.focus);
    this.term.textarea.addEventListener("blur", callbacks.blur);

    this.term.textarea.addEventListener("keyup", async ev => {
      if (ev.ctrlKey && ev.shiftKey) {
        switch (ev.keyCode) {
          case 86:
            try {
              let text = await window.navigator.clipboard.readText();

              this.writeStr(text);
            } catch (e) {
              alert(
                "Unable to paste: " +
                  e +
                  ". Please try again without using the Control+Shift+V hot key"
              );
            }
            return;

          case 67:
            try {
              window.navigator.clipboard.writeText(this.term.getSelection());
            } catch (e) {
              alert("Unable to copy: " + e);
            }
            return;
        }
      }
    });

    this.term.element.addEventListener("click", () => {
      this.term.textarea.blur();
      this.term.textarea.click();
      this.term.textarea.focus();
    });

    this.refit();
  }

  dispatch(event) {
    try {
      this.term.textarea.dispatchEvent(event);
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  writeStr(d) {
    try {
      this.term.write(d);
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  write(d) {
    try {
      this.term.writeUtf8(d);
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  focus() {
    try {
      this.term.focus();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  blur() {
    try {
      this.term.blur();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  refit() {
    try {
      this.fit.fit();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  }

  destroy() {
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
    specialKeyHTML(key) {
      const head = '<span class="tb-key-icon icon icon-keyboardkey1">',
        tail = "</span>";

      return head + key.split("+").join(tail + "+" + head) + tail;
    }
  },
  props: {
    active: {
      type: Boolean,
      default: false
    },
    control: {
      type: Object,
      default: () => null
    },
    change: {
      type: Object,
      default: () => null
    },
    toolbar: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      screenKeys: consoleScreenKeys,
      term: new Term(this.control),
      runner: null
    };
  },
  watch: {
    active() {
      this.triggerActive();
    },
    change: {
      handler() {
        if (!this.active) {
          return;
        }

        this.fit();
      },
      deep: true
    }
  },
  mounted() {
    this.init();
  },
  beforeDestroy() {
    this.deinit();
  },
  methods: {
    triggerActive() {
      this.active ? this.activate() : this.deactivate();
    },
    init() {
      let self = this;

      this.term.init(this.$el.getElementsByClassName("console-console")[0], {
        focus(e) {
          document.addEventListener("keyup", self.localKeypress);
          document.addEventListener("keydown", self.localKeypress);
        },
        blur(e) {
          document.removeEventListener("keyup", self.localKeypress);
          document.removeEventListener("keydown", self.localKeypress);
        }
      });

      this.triggerActive();
      this.runRunner();
    },
    async deinit() {
      await this.closeRunner();
      await this.deactivate();
      this.term.destroy();
    },
    fit() {
      this.term.refit();
    },
    localKeypress(e) {
      if (!e.altKey && !e.shiftKey && !e.ctrlKey) {
        return;
      }

      e.preventDefault();
    },
    activate() {
      this.fit();
      window.addEventListener("resize", this.fit);
      this.term.focus();
    },
    async deactivate() {
      window.removeEventListener("resize", this.fit);
      document.removeEventListener("keyup", this.localKeypress);
      document.removeEventListener("keydown", this.localKeypress);
      this.term.blur();
    },
    runRunner() {
      if (this.runner !== null) {
        return;
      }

      let self = this;

      this.runner = (async () => {
        try {
          for (;;) {
            this.term.write(await this.control.receive());

            self.$emit("updated");
          }
        } catch (e) {
          self.$emit("stopped", e);
        }
      })();
    },
    async closeRunner() {
      if (this.runner === null) {
        return;
      }

      let runner = this.runner;
      this.runner = null;

      await runner;
    },
    sendSpecialKey(key) {
      if (!this.term) {
        return;
      }

      this.term.dispatch(new KeyboardEvent("keydown", key));
      this.term.dispatch(new KeyboardEvent("keyup", key));
    }
  }
};
</script>
