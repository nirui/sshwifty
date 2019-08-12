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
  <div
    class="screen-console"
    :style="'background-color: ' + control.activeColor()"
    style="top: 0; right: 0; left: 0; bottom: 0; padding： 0; margin: 0; position: absolute; overflow: hidden"
  />
</template>

<script>
import { Terminal } from "xterm";
import { WebLinksAddon } from "xterm-addon-web-links";
import { FitAddon } from "xterm-addon-fit";

import "./screen_console.css";
import "xterm/css/xterm.css";
import { isNumber } from "util";

class Term {
  constructor(control) {
    const resizeDelayInterval = 500;

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
      control.send(data);
    });

    this.term.onKey(ev => {
      if (!control.echo()) {
        return;
      }

      const printable =
        !ev.domEvent.altKey &&
        !ev.domEvent.altGraphKey &&
        !ev.domEvent.ctrlKey &&
        !ev.domEvent.metaKey;

      if (ev.domEvent.keyCode === 13) {
        this.writeStr("\r\n");
      } else if (ev.domEvent.keyCode === 8) {
        this.writeStr("\b \b");
      } else if (printable) {
        this.writeStr(ev.key);
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
    }
  },
  data() {
    return {
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

      this.term.init(this.$el, {
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
    }
  }
};
</script>
