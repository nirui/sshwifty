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
          @keydown="triggerSuggestions($event, key, field)"
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
          @keyup="expandTextarea($event)"
          @keydown="
            triggerSuggestions($event, key, field) || expandTextarea($event)
          "
          @focus="focus(key, field, true)"
          @blur="focus(key, field, false)"
          @input="changed(key, field, false)"
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
      style="
        width: 1px;
        height: 1px;
        margin: 10px;
        position: absolute;
        top: 0;
        bottom: 0;
        overflow: hidden;
      "
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

/**
 * @fileoverview Multi-step connection wizard form. Drives the command wizard
 * protocol (NEXT_PROMPT / NEXT_WAIT / NEXT_DONE) by running an async loop that
 * calls `connector.wizard.next()` and renders the returned step as a dynamic
 * fieldset. Handles field validation, autocomplete suggestion navigation,
 * file imports for `textfile` fields, and textarea auto-resize.
 *
 * @prop {Object} connector - The active connector object. Must expose
 *   `name`, `description`, and a `wizard` with `started()`, `close()`,
 *   `next()`, and `control().ui()` methods.
 *
 * @emits cancel - Wizard was cancelled by the user. Payload: `{true}`.
 * @emits done   - Wizard completed successfully. Payload: the wizard result data.
 */

/** @type {string} DOM id prefix for the accessible screen-reader preload hint element. */
const preloaderIDPrefix = "connector-resource-preload-control-";
/** @type {number} Milliseconds before highlighted fields auto-clear after a suggestion is applied. */
const hightlightClearTimeout = 1000;

/**
 * Creates a blank `current` step descriptor with all fields at their defaults.
 *
 * Called at the start of each wizard iteration to reset state before
 * populating it from the next wizard step.
 *
 * @private
 * @returns {{data: null, alert: boolean, clearHightlightTimeout: null, title: string,
 *   message: string, fields: Array, actionText: string, cancellable: boolean,
 *   submittable: boolean, submitting: boolean}} A fresh empty step descriptor.
 */
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
    submitting: false,
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
      },
    },
  },
  props: {
    connector: {
      type: Object,
      default: () => null,
    },
  },
  /**
   * @returns {{
   *   currentConnector: Object|null,
   *   currentConnectorCloseWait: Promise|null,
   *   current: Object,
   *   preloaderIDName: string,
   *   fieldValueBackup: Array,
   *   submitterTabIndex: number,
   *   working: boolean,
   *   disabled: boolean,
   *   cancelled: boolean
   * }}
   *   `currentConnector` — the connector being driven (may differ from prop during transitions).
   *   `currentConnectorCloseWait` — promise for the running wizard loop; null when idle.
   *   `current` — current wizard step descriptor built by `buildCurrent`.
   *   `preloaderIDName` — id for the accessibility preload hint element.
   *   `fieldValueBackup` — snapshot of all field values taken on focus, used by suggestion restore.
   *   `submitterTabIndex` — tab index assigned to the submit button.
   *   `working` — true while the wizard is between prompt steps (connection in progress).
   *   `disabled` — true after the wizard reaches NEXT_DONE; disables all controls.
   *   `cancelled` — true once the user has clicked Cancel; prevents double-cancellation.
   */
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
      cancelled: false,
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
    },
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
    /**
     * Closes the active wizard and emits the `cancel` event.
     *
     * @emits cancel - Payload: `{true}`.
     * @returns {Promise<void>}
     */
    async sendCancel() {
      await this.closeWizard();

      this.$emit("cancel", true);
    },
    /**
     * Initiates wizard cancellation if not already working or cancelled.
     *
     * Guards against double-cancel by setting `cancelled` before delegating to
     * `sendCancel`. No-op while the connection handshake is in progress.
     *
     * @returns {void}
     */
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
    /**
     * Populates `this.current` from the wizard's next step descriptor.
     *
     * Handles NEXT_PROMPT (builds reactive field list and enables the submit
     * button), NEXT_WAIT (shows title/message without a form), and NEXT_DONE
     * (emits `done` on success or displays the error message on failure).
     *
     * @param {Object} next - The step object returned by `wizard.next()`.
     *   Must expose `type()` and `data()` methods per the command protocol.
     * @returns {Object} The same `next` object, passed through for chaining.
     * @throws {Error} Re-throws any exception after updating the UI to show the error.
     */
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
              if (f.field.readonly) {
                this.verify(i, f, true);
              }
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
    /**
     * Returns the active connector, lazily initialising it from the prop on
     * the first call.
     *
     * @returns {Object} The current connector object.
     */
    getConnector() {
      if (this.currentConnector === null) {
        this.currentConnector = this.connector;
      }

      return this.currentConnector;
    },
    /**
     * Signals the wizard to close and awaits the running wizard loop promise.
     *
     * Safe to call when no wizard is running (no-op). Swallows any error thrown
     * by the wizard loop on closure.
     *
     * @returns {Promise<void>}
     */
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
    /**
     * Starts the async wizard loop that calls `wizard.next()` repeatedly until
     * a NEXT_DONE step is received or `disabled` is set.
     *
     * Stores the running promise in `currentConnectorCloseWait` so that
     * `closeWizard` can await it. Also sets `preloaderIDName` for the
     * accessibility preload hint.
     *
     * @throws {Error} If called while a wizard loop is already running.
     * @returns {void}
     */
    runWizard() {
      if (this.currentConnectorCloseWait !== null) {
        throw new Error("Cannot run wizard multiple times");
      }

      this.preloaderIDName =
        preloaderIDPrefix +
        this.getConnector().wizard.control().ui().toLowerCase();

      this.currentConnectorCloseWait = (async () => {
        while (!this.disabled) {
          this.clearFieldValueBackup();

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
    /**
     * Collects all current field values into a plain object keyed by field name.
     *
     * @returns {Object.<string, *>} Map of field name to current value.
     */
    getFieldValues() {
      let mod = {};

      for (let i = 0; i < this.current.fields.length; i++) {
        mod[this.current.fields[i].field.name] =
          this.current.fields[i].field.value;
      }

      return mod;
    },
    /**
     * Snapshots the current values of all fields into `fieldValueBackup`.
     * Called on field focus so that suggestion navigation can restore values
     * if the user dismisses suggestions.
     *
     * @returns {void}
     */
    createFieldValueBackup() {
      let backup = [];

      for (let i = 0; i < this.current.fields.length; i++) {
        backup.push(this.current.fields[i].field.value);
      }

      this.fieldValueBackup = backup;
    },
    /**
     * Empties the field-value snapshot created by `createFieldValueBackup`.
     *
     * @returns {void}
     */
    clearFieldValueBackup() {
      this.fieldValueBackup = [];
    },
    /**
     * Clears the highlight flag on every field in the current step.
     *
     * @returns {void}
     */
    clearFieldHighlights() {
      for (let i = 0; i < this.current.fields.length; i++) {
        this.current.fields[i].highlighted = false;
      }
    },
    /**
     * Schedules `clearFieldHighlights` to run after `timeout` ms, cancelling
     * any previously pending scheduled call.
     *
     * @param {number} timeout - Delay in milliseconds before highlights clear.
     * @returns {void}
     */
    delayedClearFieldHighlights(timeout) {
      const self = this;

      if (self.clearHightlightTimeout !== null) {
        clearTimeout(self.clearHightlightTimeout);
        self.clearHightlightTimeout = null;
      }

      self.clearHightlightTimeout = setTimeout(() => {
        self.clearHightlightTimeout = null;
        self.clearFieldHighlights();
      }, timeout);
    },
    /**
     * Restores all field values from the snapshot, skipping the field at `except`.
     *
     * Used when applying a suggestion to fill in companion fields without
     * overwriting the field the user is currently editing.
     *
     * @param {number} except - Index of the field to leave unchanged (-1 restores all).
     * @returns {void}
     */
    restoreFieldValuesFromBackup(except) {
      for (let i = 0; i < this.fieldValueBackup.length; i++) {
        if (except === i) {
          continue;
        }

        this.current.fields[i].field.value = this.fieldValueBackup[i];
      }
    },
    /**
     * Auto-resizes a `<textarea>` element to fit its content by resetting the
     * height to empty then setting it to the element's scroll height.
     *
     * Note: combined CSS `position` and Vue rendering can cause stutter; avoid
     * textarea fields when possible.
     *
     * @param {Event} event - The `keyup` or `keydown` DOM event from the textarea.
     * @returns {void}
     */
    expandTextarea(event) {
      // WARNING: This function may cause rendering stutter due to
      //          combined problem of CSS "Position" and Vue render.
      //          Use of "TextArea" element is thus not recommended.
      event.target.style.height = "";
      event.target.style.height = event.target.scrollHeight + "px";
    },
    /**
     * Reads the selected file from a `<input type="file">` element as UTF-8
     * text and stores the result in the adjacent hidden text input's field
     * value, then dispatches a `change` event to trigger validation.
     *
     * @param {HTMLInputElement} el - The file input element.
     * @param {Object} field - The reactive field state object whose `field.value` is updated.
     * @returns {void}
     */
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
    /**
     * Runs the field's verify function and updates its `verified`, `error`, and
     * `message` state accordingly.
     *
     * The error is only shown if the field has been modified or `force` is true,
     * preventing premature error display on untouched fields. A generic
     * "Invalid" error is set when verification fails without a specific message.
     *
     * @param {number} key - Index of the field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @param {boolean} force - When true, shows errors even on unmodified fields.
     * @returns {boolean} True if the field value is valid.
     */
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
    /**
     * Runs `verify` on every field in the current step, forcing error display.
     *
     * @returns {boolean} True only when all fields pass verification.
     */
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
    /**
     * Handles focus and blur events for a form field.
     *
     * On blur: resets suggestions (or commits the selected suggestion if the
     * field was modified). On focus: snapshots field values and refreshes
     * the suggestion list.
     *
     * @param {number} key - Index of the field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @param {boolean} focused - True when the field gains focus, false on blur.
     * @returns {void}
     */
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
            field.selectedSuggestionIndex(),
          );
        }

        return;
      }

      this.createFieldValueBackup();
      field.reloadSuggestions();
    },
    /**
     * Applies a suggestion's value to the focused field and fills in companion
     * fields from the suggestion's metadata, restoring unrelated fields from the
     * snapshot first.
     *
     * @param {number} key - Index of the field that received the suggestion.
     * @param {Object} field - Reactive field state for the focused field.
     * @param {{value: string, fields: Object.<string, *>}} suggestion - The suggestion to apply.
     * @returns {void}
     */
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
    /**
     * Applies a suggestion to the field, marks it as inputted, and then verifies it.
     *
     * @param {number} key - Index of the field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @param {boolean} force - When true, shows errors even if the field is untouched.
     * @param {{value: string, fields: Object}} suggestion - The suggestion to apply.
     * @returns {boolean} True if the field passed verification after applying the suggestion.
     */
    applySuggestionAndVerify(key, field, force, suggestion) {
      field.inputted = true;

      this.applySuggestion(key, field, suggestion);

      return this.verify(key, field, force);
    },
    /**
     * Handles value changes on any form field.
     *
     * Snapshots field values, re-enables suggestions, reloads the suggestion
     * list for the current value, and runs verification.
     *
     * @param {number} key - Index of the changed field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @param {boolean} force - When true, shows errors even if the field is untouched.
     * @returns {void}
     */
    changed(key, field, force) {
      this.createFieldValueBackup();

      field.highlighted = false;
      field.inputted = true;
      field.enableInputSuggestionsOnAllInput();
      field.reloadSuggestions();

      this.verify(key, field, force);
    },
    /**
     * Handles keyboard events on text/textarea fields to navigate and commit
     * autocomplete suggestions.
     *
     * Arrow keys move the suggestion cursor; Escape dismisses and restores the
     * original value; Enter commits the highlighted suggestion.
     *
     * @param {KeyboardEvent} event - The keyboard event from the input element.
     * @param {number} key - Index of the field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @returns {void}
     */
    triggerSuggestions(event, key, field) {
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          field.moveSuggestionsCursor(true);

          this.applySuggestionAndVerify(
            key,
            field,
            true,
            field.currentSuggestion(),
          );
          break;

        case "ArrowDown":
          event.preventDefault();
          field.moveSuggestionsCursor(false);

          this.applySuggestionAndVerify(
            key,
            field,
            true,
            field.currentSuggestion(),
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
            field.selectedSuggestionIndex(),
          );
          break;
      }
    },
    /**
     * Commits a suggestion selection triggered by a mouse click or keyboard Enter.
     *
     * Applies the suggestion, verifies the field, suppresses future suggestions
     * for the resulting value if valid, clears the snapshot, and schedules
     * highlight removal.
     *
     * @param {number} key - Index of the field within `current.fields`.
     * @param {Object} field - Reactive field state object.
     * @param {number} index - Index of the suggestion to select (-1 uses current input).
     * @returns {void}
     */
    clickInputSuggestion(key, field, index) {
      const self = this;

      field.selectSuggestion(index);

      if (
        self.applySuggestionAndVerify(
          key,
          field,
          true,
          field.currentSuggestion(),
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
    /**
     * Validates all fields and, if they pass, submits the current wizard step.
     *
     * Guards against double-submission via the `submitting` flag. Shows an
     * alert if the submission throws. No-op if the form is already submitting,
     * disabled, or the current step is not submittable.
     *
     * @returns {Promise<void>}
     */
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
    /**
     * Cancels the current cancellable wizard step (e.g. a prompt with a Cancel
     * button distinct from the top-level Cancel link).
     *
     * No-op if already submitting, disabled, or the step is not cancellable.
     *
     * @returns {Promise<void>}
     */
    async cancelAndGetNext() {
      if (this.current.submitting || this.disabled) {
        return;
      }

      if (this.current.data === null || !this.current.cancellable) {
        return;
      }

      this.current.submitting = true;

      await this.current.data.cancel();
    },
  },
};
</script>
