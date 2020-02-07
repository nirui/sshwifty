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

import Exception from "./exception.js";

/**
 * Default preset item, contains data of a default preset
 *
 */
const presetItem = {
  title: "",
  type: "",
  host: "",
  meta: {}
};

/**
 * Verify Preset Item Meta
 *
 * @param {object} preset
 *
 */
function verifyPresetItemMeta(preset) {
  for (let i in preset.meta) {
    if (typeof preset.meta[i] === "string") {
      continue;
    }

    throw new Exception(
      'The data type of meta field "' +
        i +
        '" was "' +
        typeof preset.meta[i] +
        '" instead of expected "string"'
    );
  }
}

/**
 * Parse and verify the given preset, return a valid preset
 *
 * @param {object} item
 *
 * @throws {Exception} when invalid data is given
 *
 * @return {object}
 *
 */
function parsePresetItem(item) {
  let preset = {};

  for (let i in presetItem) {
    preset[i] = presetItem[i];
  }

  for (let i in presetItem) {
    if (typeof presetItem[i] === typeof item[i]) {
      preset[i] = item[i];

      continue;
    }

    throw new Exception(
      'Expecting the data type of "' +
        i +
        '" is "' +
        typeof presetItem[i] +
        '", given "' +
        typeof item[i] +
        '" instead'
    );
  }

  verifyPresetItemMeta(preset.meta);

  return preset;
}

/**
 * Preset data
 *
 */
export class Preset {
  /**
   * constructor
   *
   * @param {object} preset preset data
   *
   */
  constructor(preset) {
    this.preset = parsePresetItem(preset);
  }

  /**
   * Return the title of the preset
   *
   * @returns {string}
   *
   */
  title() {
    return this.preset.title;
  }

  /**
   * Return the type of the preset
   *
   * @returns {string}
   *
   */
  type() {
    return this.preset.type;
  }

  /**
   * Return the host of the preset
   *
   * @returns {string}
   *
   */
  host() {
    return this.preset.host;
  }

  /**
   * Return the given meta of current preset
   *
   * @param {string} name name of the meta data
   *
   * @throws {Exception} when invalid data is given
   *
   * @returns {string}
   *
   */
  meta(name) {
    if (typeof this.preset.meta[name] !== "string") {
      throw new Exception('Meta "' + name + '" was undefined');
    }

    return this.preset.meta[name];
  }

  /**
   * Insert new meta item
   *
   * @param {string} name name of the meta data
   * @param {string} data data of the meta data
   *
   * @throws {Exception} when invalid data is given
   *
   */
  insertMeta(name, data) {
    if (typeof this.preset.meta[name] !== "undefined") {
      throw new Exception('Meta "' + name + '" has already been defined');
    }

    this.preset.meta[name] = data;
  }
}

/**
 * Returns an empty preset
 *
 * @returns {Preset}
 *
 */
export function emptyPreset() {
  return new Preset({
    title: "Default",
    type: "Default",
    host: "",
    meta: {}
  });
}

/**
 * Command Preset manager
 *
 */
export class Presets {
  /**
   * constructor
   *
   * @param {Array<object>} presets Array of preset data
   *
   */
  constructor(presets) {
    this.presets = [];

    for (let i = 0; i < presets.length; i++) {
      this.presets.push(new Preset(presets[i]));
    }
  }

  /**
   * Return all presets of a type
   *
   * @param {string} type type of the presets data
   *
   * @returns {Array<Preset>}
   *
   */
  fetch(type) {
    let presets = [];

    for (let i = 0; i < this.presets.length; i++) {
      if (this.presets[i].type() !== type) {
        continue;
      }

      presets.push(this.presets[i]);
    }

    return presets;
  }

  /**
   * Return presets with matched type and meta data
   *
   * @param {string} type type of the presets data
   * @param {string} metaName name of the meta data
   * @param {string} metaVal value of the meta data
   *
   * @returns {Array<Preset>}
   *
   */
  meta(type, metaName, metaVal) {
    let presets = [];

    for (let i = 0; i < this.presets.length; i++) {
      if (this.presets[i].type() !== type) {
        continue;
      }

      try {
        if (this.presets[i].meta(metaName) !== metaVal) {
          continue;
        }
      } catch (e) {
        if (!(e instanceof Exception)) {
          throw e;
        }

        continue;
      }

      presets.push(this.presets[i]);
    }

    return presets;
  }

  /**
   * Return presets with matched type and host
   *
   * @param {string} type type of the presets
   * @param {string} host host of the presets
   *
   * @returns {Array<Preset>}
   *
   */
  hosts(type, host) {
    let presets = [];

    for (let i = 0; i < this.presets.length; i++) {
      if (this.presets[i].type() !== type) {
        continue;
      }

      if (this.presets[i].host() !== host) {
        continue;
      }

      presets.push(this.presets[i]);
    }

    return presets;
  }
}
