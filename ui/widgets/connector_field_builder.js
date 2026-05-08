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

/**
 * @fileoverview Factory for building reactive connector field state objects
 * used by the connector wizard form. Each field object tracks value, validation
 * state, tab order, and autocomplete suggestion state.
 */

/**
 * Resolves the sequential tab index for a given field.
 *
 * Read-only fields and unsupported field types always return 0 (no tab stop).
 * Interactive field types inherit the sequential `tabIndex` value passed in.
 *
 * @private
 * @param {number} tabIndex - The current sequential tab index counter.
 * @param {{readonly: boolean, type: string}} field - The field descriptor.
 * @returns {number} The tab index for the field element, or 0 if not focusable.
 */
function getTabIndex(tabIndex, field) {
  if (field.readonly) {
    return 0;
  }

  switch (field.type) {
    case "text":
    case "password":
    case "checkbox":
    case "textarea":
    case "textfile":
    case "select":
    case "radio":
      return tabIndex;

    default:
      return 0;
  }
}

/**
 * Builds the reactive state object for a single connector wizard field.
 *
 * The returned object is consumed directly by the connector.vue component and
 * holds all UI-facing state: validation, modification tracking, focus/highlight
 * flags, tab indices, and the nested suggestion sub-state machine.
 *
 * @param {number} tabIndex - Sequential tab index assigned to this field.
 * @param {number} i - Zero-based position of the field within the current step.
 * @param {Object} field - The field descriptor from the command wizard, which
 *   must expose at least `name`, `type`, `value`, `readonly`, `example`,
 *   `description`, `verify(value)`, and `suggestions(value)`.
 * @returns {Object} A reactive field state object with validation helpers,
 *   tab-order helpers, and the `suggestion` sub-object for autocomplete state.
 */
export function build(tabIndex, i, field) {
  return {
    /** @type {boolean} Whether the current field value has passed verification. */
    verified: false,
    /** @type {boolean} Whether the user has changed the field at least once. */
    modified: false,
    /** @type {boolean} Whether the user has interacted with the field (used to gate suggestion resets). */
    inputted: false,
    /** @type {boolean} Whether the field should be visually highlighted (e.g. after suggestion fill). */
    highlighted: false,
    /** @type {string} Current validation error message; empty when valid. */
    error: "",
    /** @type {string} Informational message returned by the field's verify function. */
    message: "",
    field: field,
    /** @type {boolean} True for the first interactive field; instructs the template to autofocus it. */
    autofocus: tabIndex === 1 && !field.readonly,
    /** @type {number} HTML tabindex for this field's form element. */
    tabIndex: getTabIndex(tabIndex, field),
    /** @type {string} The field value at which suggestions were explicitly disabled by the user. */
    blockedSuggestionValue: "",
    /** @type {boolean} Whether suggestion display is currently suppressed for this field. */
    blockingSuggestion: false,
    /**
     * Computes the next sequential tab index after consuming this field's tab stop(s).
     *
     * Radio fields consume one tab stop per option; all others consume one.
     * Read-only fields do not consume any tab stop.
     *
     * @returns {number} The tab index to assign to the next field.
     */
    nextTabIndex() {
      let nextTabIndex = 0;

      if (this.field.readonly) {
        nextTabIndex = this.tabIndex;
      } else {
        switch (this.field.type) {
          case "radio":
            nextTabIndex = this.tabIndex + this.field.example.split(",").length;
            break;

          default:
            nextTabIndex = this.tabIndex + 1;
        }
      }

      if (tabIndex >= nextTabIndex) {
        return tabIndex;
      }

      return nextTabIndex;
    },
    /**
     * Computes the tab index for a sub-element within a multi-input field (e.g. one radio option).
     *
     * @param {number} subIndex - Zero-based index of the sub-element within the field.
     * @returns {number} Tab index for the sub-element, or 0 if the field is read-only.
     */
    nextSubTabIndex(subIndex) {
      if (this.field.readonly) {
        return 0;
      }

      return this.tabIndex + subIndex;
    },
    /**
     * Autocomplete suggestion sub-state machine for this field.
     *
     * Tracks which suggestion is keyboard-selected, the full list of suggestions,
     * the original value before navigation began, and a "holding" flag that
     * prevents premature resets while the mouse is over the suggestion list.
     */
    suggestion: {
      /** @type {number} Index of the keyboard-highlighted suggestion, or -1 for none. */
      selected: -1,
      /** @type {Array<{title: string, value: string, fields: Object}>} Current suggestion list. */
      suggestions: [],
      /** @type {string} The field value captured before keyboard navigation started. */
      orignalValue: "",
      /** @type {boolean} Whether `orignalValue` has been stored. */
      orignalValueStored: false,
      /** @type {boolean} True while the mouse is hovering over the suggestion list. */
      holding: false,
      /** @type {boolean} Deferred reset flag set during hold; cleared on mouse leave. */
      needsReset: false,
      /**
       * Fully clears all suggestion state and dismisses the list.
       *
       * @returns {true} Always returns true (signals that the reset occurred).
       */
      reset() {
        this.selected = -1;
        this.suggestions = [];
        this.holding = false;
        this.needsReset = false;
        this.clearStored();

        return true;
      },
      /**
       * Attempts a non-destructive reset; defers if the list is being held.
       *
       * @returns {boolean} True if the reset executed immediately, false if deferred.
       */
      softReset() {
        if (this.holding) {
          this.needsReset = true;

          return false;
        }

        return this.reset();
      },
      /**
       * Sets the mouse-hover hold flag. If hold is released and a deferred reset
       * is pending, executes the reset immediately.
       *
       * @param {boolean} toHold - Whether to hold (true) or release (false).
       * @returns {void}
       */
      hold(toHold) {
        this.holding = toHold;

        if (this.holding || !this.needsReset) {
          return;
        }

        this.reset();
      },
      /**
       * Captures the original field value before keyboard navigation alters it.
       * No-op if a value is already stored.
       *
       * @param {string} val - The current field value to preserve.
       * @returns {void}
       */
      storeOrignal(val) {
        if (this.orignalValueStored) {
          return;
        }

        this.orignalValue = val;
        this.orignalValueStored = true;
      },
      /**
       * Returns the stored original value, or a provided default if nothing is stored.
       *
       * @param {string} defaultValue - Fallback value when no original is stored.
       * @returns {string} The stored original value or `defaultValue`.
       */
      loadStored(defaultValue) {
        return this.orignalValueStored ? this.orignalValue : defaultValue;
      },
      /**
       * Clears the stored original value.
       *
       * @returns {void}
       */
      clearStored() {
        this.orignalValue = "";
        this.orignalValueStored = false;
      },
      /**
       * Moves the keyboard selection to the given suggestion index.
       *
       * Stores the original field value on the first navigation away from -1.
       * Out-of-range indices (below -1 or beyond the list) are silently ignored.
       *
       * @param {number} index - Target suggestion index (-1 deselects all).
       * @param {string} fieldValue - The current raw field value (used for first-time storage).
       * @returns {void}
       */
      select(index, fieldValue) {
        if (this.selected < 0) {
          this.storeOrignal(fieldValue);
        }

        if (index < -1 || index >= this.suggestions.length) {
          return;
        }

        this.selected = index;
      },
      /**
       * Moves the keyboard cursor one step up (toward lower indices).
       *
       * @param {string} fieldValue - The current raw field value.
       * @returns {void}
       */
      cursorUp(fieldValue) {
        this.select(this.selected - 1, fieldValue);
      },
      /**
       * Moves the keyboard cursor one step down (toward higher indices).
       *
       * @param {string} fieldValue - The current raw field value.
       * @returns {void}
       */
      cursorDown(fieldValue) {
        this.select(this.selected + 1, fieldValue);
      },
      /**
       * Moves the cursor up or down based on a direction flag.
       *
       * @param {boolean} toUp - True to move up, false to move down.
       * @param {string} fieldValue - The current raw field value.
       * @returns {void}
       */
      cursorMove(toUp, fieldValue) {
        toUp ? this.cursorUp(fieldValue) : this.cursorDown(fieldValue);
      },
      /**
       * Replaces the suggestion list with a fresh set derived from the field's
       * suggestion provider. Skips loading if the only suggestion exactly matches
       * the current input (prevents trivial single-entry lists).
       *
       * @param {string} fieldValue - The current raw field value.
       * @param {Array<{title: string, value: string, meta: Object}>} suggestions - New suggestions from the field descriptor.
       * @returns {void}
       */
      reload(fieldValue, suggestions) {
        this.selected = -1;
        this.suggestions = [];

        this.clearStored();

        if (suggestions.length === 1 && suggestions[0].value === fieldValue) {
          return;
        }

        for (let v in suggestions) {
          this.suggestions.push({
            title: suggestions[v].title,
            value: suggestions[v].value,
            fields: suggestions[v].meta,
          });
        }
      },
      /**
       * Returns the currently selected suggestion, or a synthetic "Input" entry
       * representing the user's own text when nothing is keyboard-selected.
       *
       * @param {string} defaultValue - The field's current raw value, used as the
       *   value of the synthetic entry when `selected` is -1.
       * @returns {{title: string, value: string, fields: Object}} The active suggestion.
       */
      current(defaultValue) {
        if (this.selected < 0) {
          return {
            title: "Input",
            value: this.loadStored(defaultValue),
            fields: {},
          };
        }

        return this.suggestions[this.selected];
      },
    },
    /**
     * Suppresses autocomplete suggestions whenever the field value equals `val`.
     *
     * Called after the user explicitly dismisses the suggestion list via Escape,
     * preventing it from immediately re-opening on the same value.
     *
     * @param {string} val - The field value at which suggestions should be blocked.
     * @returns {void}
     */
    disableSuggestionsForInput(val) {
      this.blockedSuggestionValue = val;
      this.blockingSuggestion = true;
    },
    /**
     * Re-enables autocomplete suggestions for all input values.
     *
     * Called when the user types a new character, clearing any prior suppression.
     *
     * @returns {void}
     */
    enableInputSuggestionsOnAllInput() {
      this.blockedSuggestionValue = "";
      this.blockingSuggestion = false;
    },
    /**
     * Returns whether the suggestion list is currently non-empty.
     *
     * @returns {boolean} True if there is at least one suggestion to display.
     */
    suggestionsPending() {
      return this.suggestion.suggestions.length > 0;
    },
    /**
     * Refreshes the suggestion list from the field's suggestion provider,
     * unless suggestions are currently suppressed for the current value.
     *
     * @returns {void}
     */
    reloadSuggestions() {
      if (
        this.blockingSuggestion &&
        this.field.value === this.blockedSuggestionValue
      ) {
        return;
      }

      this.suggestion.reload(
        this.field.value,
        this.field.suggestions(this.field.value),
      );
    },
    /**
     * Resets the suggestion list, either immediately or deferring if held.
     *
     * @param {boolean} force - When true, performs a hard reset even while held.
     * @returns {boolean} True if the reset was applied immediately.
     */
    resetSuggestions(force) {
      return force ? this.suggestion.reset() : this.suggestion.softReset();
    },
    /**
     * Sets the mouse-hover hold flag on the suggestion list.
     *
     * @param {boolean} toHold - True to hold, false to release.
     * @returns {void}
     */
    holdSuggestions(toHold) {
      this.suggestion.hold(toHold);
    },
    /**
     * Moves the keyboard cursor within the suggestion list.
     *
     * @param {boolean} toUp - True to move up, false to move down.
     * @returns {void}
     */
    moveSuggestionsCursor(toUp) {
      this.suggestion.cursorMove(toUp, this.field.value);
    },
    /**
     * Selects the suggestion at the given index.
     *
     * @param {number} index - Zero-based suggestion index to select.
     * @returns {void}
     */
    selectSuggestion(index) {
      this.suggestion.select(index, this.field.value);
    },
    /**
     * Returns the currently highlighted suggestion, or a synthetic entry for
     * the user's own input when nothing is selected.
     *
     * @returns {{title: string, value: string, fields: Object}} Active suggestion.
     */
    currentSuggestion() {
      return this.suggestion.current(this.field.value);
    },
    /**
     * Returns the index of the currently keyboard-selected suggestion.
     *
     * @returns {number} Selected index, or -1 when nothing is selected.
     */
    selectedSuggestionIndex() {
      return this.suggestion.selected;
    },
  };
}
