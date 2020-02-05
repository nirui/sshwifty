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
        :class="{ error: field.error.length > 0, highlight: field.highlighted }"
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
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @keydown="keydown($event, key, field)"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
          @change="changed(key, field, true)"
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
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
          @change="changed(key, field, true)"
        />

        <input
          v-if="field.field.type === 'checkbox'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          type="checkbox"
          autocomplete="off"
          :name="field.field.name"
          :autofocus="field.autofocus"
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
          @change="changed(key, field, true)"
        />

        <textarea
          v-if="field.field.type === 'textarea'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          autocomplete="off"
          :placeholder="field.field.example"
          :name="field.field.name"
          :autofocus="field.autofocus"
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @keydown="keydown(key, field)"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
          @keyup="expandTextarea"
          @change="changed(key, field, true)"
        ></textarea>

        <input
          v-if="field.field.type === 'textfile'"
          v-focus="field.autofocus"
          type="file"
          autocomplete="off"
          :placeholder="field.field.example"
          :name="field.field.name + '-file'"
          :autofocus="field.autofocus"
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @change="importFile($event.target, field)"
        />
        <input
          v-if="field.field.type === 'textfile'"
          v-model="field.field.value"
          type="text"
          autocomplete="off"
          :name="field.field.name"
          :placeholder="field.field.example"
          style="display: none"
          @input="changed(key, field, false)"
          @change="changed(key, field, true)"
        />

        <select
          v-if="field.field.type === 'select'"
          v-model="field.field.value"
          v-focus="field.autofocus"
          autocomplete="off"
          :name="field.field.name"
          :autofocus="field.autofocus"
          :value="field.field.value"
          :tabindex="field.tabIndex"
          :disabled="field.field.readonly"
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
          @change="changed(key, field, true)"
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
              v-focus="field.autofocus && oKey === 0"
              type="radio"
              autocomplete="off"
              :name="field.field.name"
              :autofocus="field.autofocus && oKey === 0"
              :value="option"
              :checked="field.field.value === option"
              :aria-checked="field.field.value === option"
              :tabindex="field.nextSubTabIndex(oKey)"
              :disabled="field.field.readonly"
              @focus="focus(key, field, true)"
              @blur="focus(key, field, false)"
              @input="changed(key, field, false)"
              @change="changed(key, field, true)"
            />
            {{ option }}
          </label>
        </div>

        <ul
          v-if="field.suggestion.suggestions.length > 0"
          class="input-suggestions lst-nostyle"
          @mouseenter="field.holdSuggestions(true)"
          @mouseleave="field.holdSuggestions(false)"
        >
          <li
            v-for="(suggestion, sKey) in field.suggestion.suggestions"
            :key="sKey"
            :class="{ current: sKey === field.suggestion.selected }"
            @click="clickInputSuggestion(key, field, sKey)"
          >
            <div class="sugt-title">
              {{ suggestion.title }}
            </div>
            <div class="sugt-value">
              {{ suggestion.value }}
            </div>
          </li>
        </ul>

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
          v-focus="submitterTabIndex === 1"
          type="submit"
          :disabled="current.submitting || disabled"
          :tabindex="submitterTabIndex"
          :autofocus="submitterTabIndex === 1"
          @click="submitAndGetNext"
        >
          {{ current.actionText }}
        </button>
        <button
          v-if="current.cancellable"
          :disabled="current.submitting || disabled"
          :tabindex="submitterTabIndex + 1"
          class="secondary"
          @click="cancelAndGetNext"
        >
          Cancel
        </button>
      </div>
    </fieldset>

    <div
      v-if="preloaderIDName.length > 0"
      style="width: 1px; height: 1px; margin: 10px; position: absolute; top: 0; bottom: 0; overflow: hidden;"
    >
      <div :id="preloaderIDName">
        {{ current.title || connector.name }} wizard
      </div>
    </div>
  </form>
</template>

<script>
import "./connector.css";
import * as command from "../commands/commands.js";
import * as fieldBuilder from "./connector_field_builder.js";

const preloaderIDPrefix = "connector-resource-preload-control-";
const hightlightClearTimeout = 1000;

function buildEmptyCurrent() {
  return {
    data: null,
    alert: false,
    clearHightlightTimeout: null,
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
      preloaderIDName: "",
      fieldValueBackup: [],
      submitterTabIndex: 1,
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

        let fields = null,
          tabIndex = 1;

        switch (this.current.type) {
          case command.NEXT_PROMPT:
            fields = this.current.data.inputs();

            for (let i = 0; i < fields.length; i++) {
              const f = fieldBuilder.build(tabIndex, i, fields[i]);

              this.current.fields.push(f);
              tabIndex = f.nextTabIndex();
            }

            this.submitterTabIndex = tabIndex > 0 ? tabIndex : 1;
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

      try {
        await waiter;
      } catch (e) {
        // Do nothing
      }
    },
    runWizard() {
      if (this.currentConnectorCloseWait !== null) {
        throw new Error("Cannot run wizard multiple times");
      }

      this.preloaderIDName =
        preloaderIDPrefix +
        this.getConnector()
          .wizard.control()
          .ui()
          .toLowerCase();

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

      for (let i = 0; i < this.current.fields.length; i++) {
        mod[this.current.fields[i].field.name] = this.current.fields[
          i
        ].field.value;
      }

      return mod;
    },
    createFieldValueBackup() {
      let backup = [];

      for (let i = 0; i < this.current.fields.length; i++) {
        backup.push(this.current.fields[i].field.value);
      }

      this.fieldValueBackup = backup;
    },
    clearFieldValueBackup() {
      this.fieldValueBackup = [];
    },
    clearFieldHighlights() {
      for (let i = 0; i < this.current.fields.length; i++) {
        this.current.fields[i].highlighted = false;
      }
    },
    delayedClearFieldHighlights(timeout) {
      const self = this;

      if (self.clearHightlightTimeout === null) {
        clearTimeout(self.clearHightlightTimeout);
        self.clearHightlightTimeout = null;
      }

      self.clearHightlightTimeout = setTimeout(() => {
        self.clearHightlightTimeout = null;
        self.clearFieldHighlights();
      }, timeout);
    },
    restoreFieldValuesFromBackup(except) {
      for (let i = 0; i < this.fieldValueBackup.length; i++) {
        if (except === i) {
          continue;
        }

        this.current.fields[i].field.value = this.fieldValueBackup[i];
      }
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
        field.modified = true;
        field.verified = true;
        field.error = "";
      } catch (e) {
        field.error = "";
        field.message = "";
        field.verified = false;

        if (field.modified || force) {
          field.error = "" + e;
        }
      }

      field.highlighted = false;

      if (
        !field.verified &&
        (field.modified || force) &&
        field.error.length <= 0
      ) {
        field.error = "Invalid";
      }

      return field.verified;
    },
    verifyAll() {
      let verified = true;

      for (let i = 0; i < this.current.fields.length; i++) {
        if (this.verify(i, this.current.fields[i], true)) {
          continue;
        }

        verified = false;
      }

      return verified;
    },
    focus(key, field, focused) {
      field.highlighted = false;

      if (!focused) {
        // Don't reset a holding field
        if (!field.inputted) {
          field.resetSuggestions(false);
        } else if (field.resetSuggestions(false)) {
          this.clickInputSuggestion(
            key,
            field,
            field.selectedSuggestionIndex()
          );
        }

        return;
      }

      this.createFieldValueBackup();
      field.reloadSuggestions();
    },
    applySuggestion(key, field, suggestion) {
      this.restoreFieldValuesFromBackup(-1);

      field.field.value = suggestion.value;

      for (let i = 0; i < this.current.fields.length; i++) {
        this.current.fields[i].highlighted = false;

        if (
          i === key ||
          this.current.fields[i].inputted ||
          this.current.fields[i].field.readonly
        ) {
          continue;
        }

        if (
          typeof suggestion.fields[this.current.fields[i].field.name] ===
          "undefined"
        ) {
          continue;
        }

        this.current.fields[i].field.value =
          suggestion.fields[this.current.fields[i].field.name];

        if (!this.verify(i, this.current.fields[i], true)) {
          continue;
        }

        this.current.fields[i].highlighted = true;
      }
    },
    applySuggestionAndVerify(key, field, force, suggestion) {
      field.inputted = true;

      this.applySuggestion(key, field, suggestion);

      return this.verify(key, field, force);
    },
    changed(key, field, force) {
      this.createFieldValueBackup();

      field.highlighted = false;
      field.inputted = true;
      field.enableInputSuggestionsOnAllInput();
      field.reloadSuggestions();

      this.verify(key, field, force);
    },
    keydown(event, key, field) {
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          field.moveSuggestionsCursor(true);

          this.applySuggestionAndVerify(
            key,
            field,
            true,
            field.curentSuggestion()
          );
          break;

        case "ArrowDown":
          event.preventDefault();
          field.moveSuggestionsCursor(false);

          this.applySuggestionAndVerify(
            key,
            field,
            true,
            field.curentSuggestion()
          );
          break;

        case "Escape":
          if (!field.suggestionsPending()) {
            return;
          }

          event.preventDefault();

          this.restoreFieldValuesFromBackup(key);
          this.clearFieldValueBackup();
          this.clearFieldHighlights();
          this.verify(key, field, true);

          field.disableSuggestionsForInput(field.field.value);
          field.resetSuggestions(true);
          break;

        case "Enter":
          if (!field.suggestionsPending()) {
            return;
          }

          event.preventDefault();

          this.clickInputSuggestion(
            key,
            field,
            field.selectedSuggestionIndex()
          );
          break;
      }
    },
    clickInputSuggestion(key, field, index) {
      const self = this;

      field.selectSuggestion(index);

      if (
        self.applySuggestionAndVerify(
          key,
          field,
          true,
          field.curentSuggestion()
        )
      ) {
        field.disableSuggestionsForInput(field.field.value);
      } else {
        field.enableInputSuggestionsOnAllInput();
      }

      field.resetSuggestions(true);

      self.clearFieldValueBackup();
      self.delayedClearFieldHighlights(hightlightClearTimeout);
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
