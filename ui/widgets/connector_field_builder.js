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

export function build(tabIndex, i, field) {
  return {
    verified: false,
    modified: false,
    inputted: false,
    highlighted: false,
    error: "",
    message: "",
    field: field,
    autofocus: tabIndex === 1 && !field.readonly,
    tabIndex: getTabIndex(tabIndex, field),
    blockedSuggestionValue: "",
    blockingSuggestion: false,
    nextTabIndex() {
      if (this.field.readonly) {
        return this.tabIndex;
      }

      switch (this.field.type) {
        case "radio":
          return this.tabIndex + this.field.example.split(",").length;

        default:
          return this.tabIndex + 1;
      }
    },
    nextSubTabIndex(subIndex) {
      if (this.field.readonly) {
        return 0;
      }

      return this.tabIndex + subIndex;
    },
    suggestion: {
      selected: -1,
      suggestions: [],
      orignalValue: "",
      orignalValueStored: false,
      holding: false,
      needsReset: false,
      reset() {
        this.selected = -1;
        this.suggestions = [];
        this.holding = false;
        this.needsReset = false;
        this.clearStored();

        return true;
      },
      softReset() {
        if (this.holding) {
          this.needsReset = true;

          return false;
        }

        return this.reset();
      },
      hold(toHold) {
        this.holding = toHold;

        if (this.holding || !this.needsReset) {
          return;
        }

        this.reset();
      },
      storeOrignal(val) {
        if (this.orignalValueStored) {
          return;
        }

        this.orignalValue = val;
        this.orignalValueStored = true;
      },
      loadStored(defaultValue) {
        return this.orignalValueStored ? this.orignalValue : defaultValue;
      },
      clearStored() {
        this.orignalValue = "";
        this.orignalValueStored = false;
      },
      select(index, fieldValue) {
        if (this.selected < 0) {
          this.storeOrignal(fieldValue);
        }

        if (index < -1 || index >= this.suggestions.length) {
          return;
        }

        this.selected = index;
      },
      cursorUp(fieldValue) {
        this.select(this.selected - 1, fieldValue);
      },
      cursorDown(fieldValue) {
        this.select(this.selected + 1, fieldValue);
      },
      cursorMove(toUp, fieldValue) {
        toUp ? this.cursorUp(fieldValue) : this.cursorDown(fieldValue);
      },
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
            fields: suggestions[v].meta
          });
        }
      },
      current(defaultValue) {
        if (this.selected < 0) {
          return {
            title: "Input",
            value: this.loadStored(defaultValue),
            fields: {}
          };
        }

        return this.suggestions[this.selected];
      }
    },
    disableSuggestionsForInput(val) {
      this.blockedSuggestionValue = val;
      this.blockingSuggestion = true;
    },
    enableInputSuggestionsOnAllInput() {
      this.blockedSuggestionValue = "";
      this.blockingSuggestion = false;
    },
    suggestionsPending() {
      return this.suggestion.suggestions.length > 0;
    },
    reloadSuggestions() {
      if (
        this.blockingSuggestion &&
        this.field.value === this.blockedSuggestionValue
      ) {
        return;
      }

      this.suggestion.reload(
        this.field.value,
        this.field.suggestions(this.field.value)
      );
    },
    resetSuggestions(force) {
      return force ? this.suggestion.reset() : this.suggestion.softReset();
    },
    holdSuggestions(toHold) {
      this.suggestion.hold(toHold);
    },
    moveSuggestionsCursor(toUp) {
      this.suggestion.cursorMove(toUp, this.field.value);
    },
    selectSuggestion(index) {
      this.suggestion.select(index, this.field.value);
    },
    curentSuggestion() {
      return this.suggestion.current(this.field.value);
    },
    selectedSuggestionIndex() {
      return this.suggestion.selected;
    }
  };
}
