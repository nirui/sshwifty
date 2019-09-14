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
  <form
    id="connector"
    class="form1"
    action="javascript:;"
    method="POST"
    @submit="submitAndGetNext"
  >
    <a
      id="connector-cancel"
      href="javascript:;"
      :class="{ disabled: working || cancelled }"
      @click="cancel()"
    >
      Cancel
    </a>

    <div
      v-if="!working"
      id="connector-title"
      :class="{ big: current.fields.length <= 0 }"
    >
      <h2>{{ current.title || connector.name }}</h2>

      <p>{{ current.message || connector.description }}</p>
    </div>

    <div v-if="working" id="connector-proccess">
      <img id="connector-proccess-indicater" src="./connecting.svg" />

      <div id="connector-proccess-message" :class="{ alert: current.alert }">
        <h2>
          <span>{{ current.title || connector.name }}</span>
        </h2>

        <p>{{ current.message || connector.description }}</p>
      </div>
    </div>

    <fieldset id="connector-fields">
      <div
        v-for="(field, key) in current.fields"
        :key="key"
        class="field"
        :class="{ error: field.error.length > 0 }"
      >
        {{ field.field.name }}

        <input
          v-if="field.field.type === 'text'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          type="text"
          autocomplete="off"
          :name="field.field.name"
          :placeholder="field.field.example"
          :autofocus="field.autofocus"
          @input="verify(key, field, false)"
          @change="verify(key, field, true)"
        />

        <input
          v-if="field.field.type === 'password'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          type="password"
          autocomplete="off"
          :name="field.field.name"
          :placeholder="field.field.example"
          :autofocus="field.autofocus"
          @input="verify(key, field, false)"
          @change="verify(key, field, true)"
        />

        <input
          v-if="field.field.type === 'checkbox'"
          v-model="field.field.value"
          type="checkbox"
          autocomplete="off"
          :name="field.field.name"
          @input="verify(key, field, false)"
          @change="verify(key, field, true)"
        />

        <textarea
          v-if="field.field.type === 'textarea'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          autocomplete="off"
          :placeholder="field.field.example"
          :name="field.field.name"
          :autofocus="field.autofocus"
          @input="verify(key, field, false)"
          @keyup="expandTextarea"
          @change="verify(key, field, true)"
        ></textarea>

        <input
          v-if="field.field.type === 'textfile'"
          type="file"
          autocomplete="off"
          :placeholder="field.field.example"
          :name="field.field.name + '-file'"
          :autofocus="field.autofocus"
          @change="importFile($event.target, field)"
        />
        <input
          v-if="field.field.type === 'textfile'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          type="text"
          autocomplete="off"
          :name="field.field.name"
          :placeholder="field.field.example"
          :autofocus="field.autofocus"
          style="display: none"
          @input="verify(key, field, false)"
          @change="verify(key, field, true)"
        />

        <div v-if="field.field.type === 'textdata'" class="textinfo">
          <div class="info">{{ field.field.value }}</div>
        </div>

        <div v-if="field.field.type === 'radio'" class="items">
          <label
            v-for="(option, oKey) in field.field.example.split(',')"
            :key="oKey"
            class="field horizontal item"
          >
            <input
              v-model="field.field.value"
              type="radio"
              autocomplete="off"
              :name="field.field.name"
              :value="option"
              :checked="field.field.value === option"
              :aria-checked="field.field.value === option"
              @input="verify(key, field, false)"
              @change="verify(key, field, true)"
            />
            {{ option }}
          </label>
        </div>

        <div v-if="field.field.type === 'select'" class="field">
          <select
            v-model="field.field.value"
            autocomplete="off"
            :name="field.field.name"
            :value="field.field.value"
            @input="verify(key, field, false)"
            @change="verify(key, field, true)"
          >
            <option
              v-for="(option, oKey) in field.field.example.split(',')"
              :key="oKey"
              :value="option"
              :selected="field.field.value === option"
              :aria-selected="field.field.value === option"
            >
              {{ option }}
            </option>
          </select>
        </div>

        <div v-if="field.error.length > 0" class="error">{{ field.error }}</div>
        <div v-else-if="field.message.length > 0" class="message">
          {{ field.message }}
        </div>
        <div
          v-else-if="field.field.description.length > 0"
          class="message"
          v-html="field.field.description"
        ></div>
      </div>

      <div class="field">
        <button
          v-if="current.submittable"
          type="submit"
          :disabled="current.submitting || disabled"
          @click="submitAndGetNext"
        >
          {{ current.actionText }}
        </button>
        <button
          v-if="current.cancellable"
          :disabled="current.submitting || disabled"
          class="secondary"
          @click="cancelAndGetNext"
        >
          Cancel
        </button>
      </div>
    </fieldset>
  </form>
</template>

<script>
import "./connector.css";
import * as command from "../commands/commands.js";

function buildField(i, field) {
  return {
    verified: false,
    inputted: false,
    error: "",
    message: "",
    field: field,
    autofocus: i == 0
  };
}

function buildEmptyCurrent() {
  return {
    data: null,
    alert: false,
    title: "",
    message: "",
    fields: [],
    actionText: "Continue",
    cancellable: false,
    submittable: false,
    submitting: false
  };
}

export default {
  directives: {
    focus: {
      inserted(el, binding) {
        if (!binding.value) {
          return;
        }

        el.focus();
      }
    }
  },
  props: {
    connector: {
      type: Object,
      default: () => null
    }
  },
  data() {
    return {
      currentConnector: null,
      currentConnectorCloseWait: null,
      current: buildEmptyCurrent(),
      working: false,
      disabled: false,
      cancelled: false
    };
  },
  watch: {
    async connector(oldV, newV) {
      if (this.currentConnector !== null) {
        await this.closeWizard();
      }

      this.cancelled = false;
      this.currentConnector = newV;
      this.runWizard();
    }
  },
  async mounted() {
    await this.closeWizard();
    this.runWizard();
    this.cancelled = false;
  },
  async beforeDestroy() {
    try {
      await this.closeWizard();
    } catch (e) {
      process.env.NODE_ENV === "development" && console.trace(e);
    }
  },
  methods: {
    async sendCancel() {
      await this.closeWizard();

      this.$emit("cancel", true);
    },
    cancel() {
      if (this.working) {
        return;
      }

      if (this.cancelled) {
        return;
      }

      this.cancelled = true;

      this.sendCancel();
    },
    buildCurrent(next) {
      try {
        this.current = buildEmptyCurrent();

        this.working = this.getConnector().wizard.started();

        this.current.type = next.type();
        this.current.data = next.data();

        switch (this.current.type) {
          case command.NEXT_PROMPT:
            let fields = this.current.data.inputs();

            for (let i in fields) {
              this.current.fields.push(buildField(i, fields[i]));
            }

            this.current.actionText = this.current.data.actionText();
            this.current.submittable = true;
            this.current.alert = true;
            this.current.cancellable = true;

          // Fallthrough

          case command.NEXT_WAIT:
            this.current.title = this.current.data.title();
            this.current.message = this.current.data.message();
            break;

          case command.NEXT_DONE:
            this.working = false;
            this.disabled = true;

            if (!this.current.data.success()) {
              this.current.title = this.current.data.error();
              this.current.message = this.current.data.message();
            } else {
              this.$emit("done", this.current.data.data());
            }
            break;

          default:
            throw new Error("Unknown command type");
        }

        if (!this.working) {
          this.current.cancellable = false;
        }

        return next;
      } catch (e) {
        this.current.title = "Encountered an error";
        this.current.message = e;

        this.working = false;
        this.disabled = true;

        throw e;
      }
    },
    getConnector() {
      if (this.currentConnector === null) {
        this.currentConnector = this.connector;
      }

      return this.currentConnector;
    },
    async closeWizard() {
      if (this.currentConnectorCloseWait === null) {
        return;
      }

      let waiter = this.currentConnectorCloseWait;

      this.currentConnectorCloseWait = null;

      this.getConnector().wizard.close();

      await waiter;
    },
    runWizard() {
      if (this.currentConnectorCloseWait !== null) {
        throw new Error("Cannot run wizard multiple times");
      }

      this.currentConnectorCloseWait = (async () => {
        while (!this.disabled) {
          let next = this.buildCurrent(await this.getConnector().wizard.next());

          switch (next.type()) {
            case command.NEXT_PROMPT:
            case command.NEXT_WAIT:
              continue;
            case command.NEXT_DONE:
              return;

            default:
              throw new Error("Unknown command type");
          }
        }
      })();
    },
    getFieldValues() {
      let mod = {};

      for (let i in this.current.fields) {
        mod[this.current.fields[i].field.name] = this.current.fields[
          i
        ].field.value;
      }

      return mod;
    },
    expandTextarea(event) {
      event.target.style.overflowY = "hidden";
      event.target.style.height = "";
      event.target.style.height = event.target.scrollHeight + "px";
    },
    importFile(el, field) {
      if (el.files.length <= 0) {
        return;
      }

      el.disabled = "disabled";

      let r = new FileReader();

      r.onload = () => {
        let s = el.nextSibling;

        for (;;) {
          if (s.tagName !== "INPUT") {
            s = s.nextSibling;

            continue;
          }

          field.field.value = r.result;
          s.dispatchEvent(new Event("change"));

          break;
        }

        el.disabled = "";
      };

      r.readAsText(el.files[0], "utf-8");
    },
    verify(key, field, force) {
      try {
        field.message = "" + field.field.verify(field.field.value);
        field.inputted = true;
        field.verified = true;
        field.error = "";
      } catch (e) {
        field.error = "";
        field.message = "";
        field.verified = false;

        if (field.inputted || force) {
          field.error = "" + e;
        }
      }

      if (
        !field.verified &&
        (field.inputted || force) &&
        field.error.length <= 0
      ) {
        field.error = "Invalid";
      }

      this.current.fields[key] = field;

      return field.verified;
    },
    verifyAll() {
      let verified = true;

      for (let i in this.current.fields) {
        if (this.verify(i, this.current.fields[i], true)) {
          continue;
        }

        verified = false;
      }

      return verified;
    },
    async submitAndGetNext() {
      if (this.current.submitting || this.disabled) {
        return;
      }

      if (this.current.data === null || !this.current.submittable) {
        return;
      }

      if (!this.verifyAll()) {
        return;
      }

      this.current.submitting = true;

      try {
        await this.current.data.submit(this.getFieldValues());
      } catch (e) {
        this.current.submitting = false;

        alert("Submission has failed: " + e);

        process.env.NODE_ENV === "development" && console.trace(e);

        return;
      }
    },
    async cancelAndGetNext() {
      if (this.current.submitting || this.disabled) {
        return;
      }

      if (this.current.data === null || !this.current.cancellable) {
        return;
      }

      this.current.submitting = true;

      await this.current.data.cancel();
    }
  }
};
</script>
