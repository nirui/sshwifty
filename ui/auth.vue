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
  <div id="auth">
    <div id="auth-frame">
      <div id="auth-content">
        <h1>Authentication required</h1>

        <form class="form1" action="javascript:;" method="POST" @submit="auth">
          <fieldset>
            <div
              class="field"
              :class="{
                error: passphraseErr.length > 0 || error.length > 0
              }"
            >
              Passphrase

              <input
                v-model="passphrase"
                v-focus="true"
                :disabled="submitting"
                type="password"
                autocomplete="off"
                name="field.field.name"
                placeholder="----------"
                autofocus="autofocus"
              />

              <div
                v-if="passphraseErr.length <= 0 && error.length <= 0"
                class="message"
              >
                A valid password is required in order to use this
                <a href="https://github.com/niruix/sshwifty">Sshwifty</a>
                instance
              </div>
              <div v-else class="error">
                {{ passphraseErr || error }}
              </div>
            </div>

            <div class="field">
              <button type="submit" :disabled="submitting" @click="auth">
                Authenticate
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
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
    error: {
      type: String,
      default: ""
    }
  },
  data() {
    return {
      submitting: false,
      passphrase: "",
      passphraseErr: ""
    };
  },
  watch: {
    error(newVal) {
      if (newVal.length > 0) {
        this.submitting = false;
      }
    }
  },
  mounted() {},
  methods: {
    auth() {
      if (this.passphrase.length <= 0) {
        this.passphraseErr = "Passphrase cannot be empty";

        return;
      }

      if (this.submitting) {
        return;
      }

      this.submitting = true;

      this.passphraseErr = "";

      this.$emit("auth", this.passphrase);
    }
  }
};
</script>
