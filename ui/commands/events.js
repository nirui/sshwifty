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

export class Events {
  /**
   * constructor
   *
   * @param {[]string} events required events
   * @param {object} callbacks Callbacks
   *
   * @throws {Exception} When event handler is not registered
   *
   */
  constructor(events, callbacks) {
    this.events = {};
    this.placeHolders = {};

    for (let i in events) {
      if (typeof callbacks[events[i]] !== "function") {
        throw new Exception(
          'Unknown event type for "' +
            events[i] +
            '". Expecting "function" got "' +
            typeof callbacks[events[i]] +
            '" instead.'
        );
      }

      let name = events[i];

      if (name.indexOf("@") === 0) {
        name = name.substring(1);

        this.placeHolders[name] = null;
      }

      this.events[name] = callbacks[events[i]];
    }
  }

  /**
   * Place callbacks to pending placeholder events
   *
   * @param {string} type Event Type
   * @param {function} callback Callback function
   */
  place(type, callback) {
    if (this.placeHolders[type] !== null) {
      throw new Exception(
        'Event type "' +
          type +
          '" cannot be appended. It maybe ' +
          "unregistered or already been acquired"
      );
    }

    if (typeof callback !== "function") {
      throw new Exception(
        'Unknown event type for "' +
          type +
          '". Expecting "function" got "' +
          typeof callback +
          '" instead.'
      );
    }

    delete this.placeHolders[type];

    this.events[type] = callback;
  }

  /**
   * Fire an event
   *
   * @param {string} type Event type
   * @param  {...any} data Event data
   *
   * @returns {any} The result of the event handler
   *
   * @throws {Exception} When event type is not registered
   *
   */
  fire(type, ...data) {
    if (!this.events[type] && this.placeHolders[type] !== null) {
      throw new Exception("Unknown event type: " + type);
    }

    return this.events[type](...data);
  }
}
