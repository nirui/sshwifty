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
 * @file Command wizard framework for the Sshwifty UI.
 *
 * Defines the multi-step wizard model used by SSH, Telnet, and any future
 * command types. Key exports:
 * - Step factory functions: {@link prompt}, {@link wait}, {@link done}
 * - Field helpers: {@link field}, {@link fields}, {@link fieldsWithPreset}
 * - {@link Commands} — registry of all available command builders
 * - {@link Builder} — wraps a command definition and exposes wizard/execute/launch
 * - {@link Info}, {@link Preset}, {@link Result} — supporting value objects
 */

import * as subscribe from "../stream/subscribe.js";
import Exception from "./exception.js";

export const NEXT_PROMPT = 1;
export const NEXT_WAIT = 2;
export const NEXT_DONE = 3;

/**
 * Holds the outcome of a successfully completed command wizard, including the
 * session name, command metadata, the control interface, and the UI component
 * identifier.
 */
export class Result {
  /**
   * constructor
   *
   * @param {string} name Display name of the result (e.g. `user@host`).
   * @param {Info} info Command info metadata.
   * @param {object} control Live control interface for sending data and signals.
   * @param {string} ui Identifier of the Vue component that should be mounted.
   */
  constructor(name, info, control, ui) {
    this.name = name;
    this.info = info;
    this.control = control;
    this.ui = ui;
  }
}

/**
 * Terminal wizard step that signals the wizard is finished.
 *
 * Carries a success flag, optional result data on success, and an error title
 * and message on failure.
 *
 * @private
 */
class Done {
  /**
   * constructor
   *
   * @param {object} data Step data with shape:
   *   `{ success, successData, errorTitle, errorMessage }`
   *
   */
  constructor(data) {
    this.s = !!data.success;
    this.d = data.successData;
    this.errorTitle = data.errorTitle;
    this.errorMessage = data.errorMessage;
  }

  /**
   * Return the error of current Done
   *
   * @returns {string} title
   *
   */
  error() {
    return this.errorTitle;
  }

  /**
   * Return the error message of current Done
   *
   * @returns {string} message
   *
   */
  message() {
    return this.errorMessage;
  }

  /**
   * Returns whether or not current Done is representing a success
   *
   * @returns {boolean} True when success, false otherwise
   */
  success() {
    return this.s;
  }

  /**
   * Returns final data
   *
   * @returns {Result} Successful result
   */
  data() {
    return this.d;
  }
}

/**
 * Intermediate wizard step that asks the UI to display a loading/waiting state.
 *
 * @private
 */
class Wait {
  /**
   * constructor
   *
   * @param {object} data Step data with shape: `{ title, message }`
   *
   */
  constructor(data) {
    this.t = data.title;
    this.m = data.message;
  }

  /**
   * Return the title of current Wait
   *
   * @returns {string} title
   *
   */
  title() {
    return this.t;
  }

  /**
   * Return the message of current Wait
   *
   * @returns {string} message
   *
   */
  message() {
    return this.m;
  }
}

const defField = {
  name: "",
  description: "",
  type: "",
  value: "",
  example: "",
  readonly: false,
  suggestions(_input) {
    return [];
  },
  verify(_v) {
    return "";
  },
};

/**
 * Create a Prompt field
 *
 * @param {object} def Field default value
 * @param {object} f Field value
 *
 * @returns {object} Field data
 *
 * @throws {Exception} When input field is invalid
 *
 */
export function field(def, f) {
  let n = {};

  for (let i in def) {
    n[i] = def[i];
  }

  for (let i in f) {
    if (typeof n[i] === typeof f[i]) {
      n[i] = f[i];

      continue;
    }

    throw new Exception(
      'Field data type for "' +
        i +
        '" was unmatched. Expecting "' +
        typeof n[i] +
        '", got "' +
        typeof f[i] +
        '" instead',
    );
  }

  if (!n["name"]) {
    throw new Exception('Field "name" must be specified');
  }

  return n;
}

/**
 * Build a group of field value
 *
 * @param {object} definitions Definition of a group of fields
 * @param {Array<object>} fs Data of the field group
 *
 * @returns {Array<object>} Result fields
 *
 * @throws {Exception} When input field is invalid
 *
 */
export function fields(definitions, fs) {
  let fss = [];

  for (let i in fs) {
    if (!fs[i]["name"]) {
      throw new Exception('Field "name" must be specified');
    }

    if (!definitions[fs[i].name]) {
      throw new Exception('Undefined field "' + fs[i].name + '"');
    }

    fss.push(field(definitions[fs[i].name], fs[i]));
  }

  return fss;
}

/**
 * Build command fields with preset data
 *
 * @param {object} definitions Definition of a group of fields
 * @param {object} fieldsData field data object, formated like a `defField`
 * @param {presets.Preset} presetData Preset data
 * @param {function} presetApplied Called when a preset is used for a field
 *
 * @returns {object}
 *
 */
export function fieldsWithPreset(
  definitions,
  fieldsData,
  presetData,
  presetApplied,
) {
  let newFields = fields(definitions, fieldsData);

  for (let i in newFields) {
    try {
      newFields[i].value = presetData.meta(newFields[i].name);
      newFields[i].readonly = true;

      presetApplied(newFields[i].name);
    } catch (e) {
      // Do nothing
    }
  }

  return newFields;
}

/**
 * Interactive wizard step that presents a form to the user.
 *
 * Validates and normalises field definitions, then exposes the `submit` method
 * so the UI can deliver validated input back to the command's step handler.
 *
 * @private
 */
class Prompt {
  /**
   * constructor
   *
   * @param {object} data Step data with shape:
   *   `{ title, message, actionText, respond, cancel, inputs }`
   * @throws {Exception} If a field's `verify` property is present but not a
   *   function.
   */
  constructor(data) {
    this.t = data.title;
    this.m = data.message;
    this.a = data.actionText;
    this.r = data.respond;
    this.c = data.cancel;

    this.i = [];
    this.f = {};

    for (let i in data.inputs) {
      let f = field(defField, data.inputs[i]);

      this.i.push(f);

      this.f[data.inputs[i].name.toLowerCase()] = {
        value: f.value,
        verify: f.verify,
      };
    }
  }

  /**
   * Return the title of current Prompt
   *
   * @returns {string} title
   *
   */
  title() {
    return this.t;
  }

  /**
   * Return the message of current Prompt
   *
   * @returns {string} message
   *
   */
  message() {
    return this.m;
  }

  /**
   * Return the input field of current prompt
   *
   * @returns {array} Input fields
   *
   */
  inputs() {
    let inputs = [];

    for (let i in this.i) {
      inputs.push(this.i[i]);
    }

    return inputs;
  }

  /**
   * Returns the name of the action
   *
   * @returns {string} Action name
   *
   */
  actionText() {
    return this.a;
  }

  /**
   * Receive the submit of current prompt
   *
   * @param {object} inputs Input value
   *
   * @returns {any} The result of the step responder
   *
   * @throws {Exception} When the field is undefined or invalid
   *
   */
  submit(inputs) {
    let fields = {};

    for (let i in this.f) {
      fields[i] = this.f[i].value;
    }

    for (let i in inputs) {
      let k = i.toLowerCase();

      if (typeof fields[k] === "undefined") {
        throw new Exception('Field "' + k + '" is undefined');
      }

      try {
        this.f[k].verify(inputs[i]);
      } catch (e) {
        throw new Exception('Field "' + k + '" is invalid: ' + e);
      }

      fields[k] = inputs[i];
    }

    return this.r(fields);
  }

  /**
   * Cancel current wait operation
   *
   */
  cancel() {
    return this.c();
  }
}

/**
 * Create a raw wizard step descriptor — the internal envelope used by
 * {@link done}, {@link wait}, and {@link prompt} before it is wrapped in
 * {@link Next}.
 *
 * @private
 * @param {string} type Step type constant (NEXT_PROMPT, NEXT_WAIT, NEXT_DONE).
 * @param {object} data Step payload.
 * @returns {object} Step descriptor with `type()` and `data()` accessors.
 */
function next(type, data) {
  return {
    type() {
      return type;
    },
    data() {
      return data;
    },
  };
}

/**
 * Create data for a Done step of the wizard
 *
 * @param {boolean} success
 * @param {Success} successData
 * @param {string} errorTitle
 * @param {string} errorMessage
 *
 * @returns {object} Done step data
 *
 */
export function done(success, successData, errorTitle, errorMessage) {
  return next(NEXT_DONE, {
    success: success,
    successData: successData,
    errorTitle: errorTitle,
    errorMessage: errorMessage,
  });
}

/**
 * Create data for a Wait step of the wizard
 *
 * @param {string} title Waiter title
 * @param {message} message Waiter message
 *
 * @returns {object} Done step data
 *
 */
export function wait(title, message) {
  return next(NEXT_WAIT, {
    title: title,
    message: message,
  });
}

/**
 * Create data for a Prompt step of the wizard
 *
 * @param {string} title Title of the prompt
 * @param {string} message Message of the prompt
 * @param {string} actionText Text of the action (button)
 * @param {function} respond Respond callback
 * @param {function} cancel cancel handler
 * @param  {object} inputs Input field objects
 *
 * @returns {object} Prompt step data
 *
 */
export function prompt(title, message, actionText, respond, cancel, inputs) {
  return next(NEXT_PROMPT, {
    title: title,
    message: message,
    actionText: actionText,
    inputs: inputs,
    respond: respond,
    cancel: cancel,
  });
}

/**
 * Typed wrapper around a raw wizard step descriptor.
 *
 * Materialises the step into a concrete {@link Done}, {@link Wait}, or
 * {@link Prompt} object via {@link Next#data}.
 *
 * @private
 */
class Next {
  /**
   * constructor
   *
   * @param {object} data Raw step descriptor (return value of {@link next}).
   */
  constructor(data) {
    this.t = data.type();
    this.d = data.data();
  }

  /**
   * Return step type
   *
   * @returns {string} Step type
   */
  type() {
    return this.t;
  }

  /**
   * Return step data
   *
   * @returns {Done|Prompt} Step data
   *
   * @throws {Exception} When the step type is unknown
   *
   */
  data() {
    switch (this.type()) {
      case NEXT_PROMPT:
        return new Prompt(this.d);

      case NEXT_WAIT:
        return new Wait(this.d);

      case NEXT_DONE:
        return new Done(this.d);

      default:
        throw new Exception("Unknown data type");
    }
  }
}

/**
 * Drives a command's multi-step UI flow.
 *
 * Launches the command's internal step generator on construction, then exposes
 * {@link Wizard#next} for the UI to consume one step at a time. When a
 * {@link Done} step is received the wizard is automatically closed and
 * the `done` callback is fired.
 *
 * @private
 */
class Wizard {
  /**
   * constructor
   *
   * @param {object} built Command executor object implementing `run()`,
   *   `started()`, `control()`, and `close()`.
   * @param {subscribe.Subscribe} subs Channel over which the executor pushes
   *   wizard steps.
   * @param {function} done Callback invoked with the final {@link Next} step
   *   when the wizard completes or is cancelled.
   *
   */
  constructor(built, subs, done) {
    this.built = built;
    this.subs = subs;
    this.done = done;
    this.closed = false;

    this.built.run();
  }

  /**
   * Return the Next step
   *
   * @returns {Next} Next step
   *
   * @throws {Exception} When wizard is closed
   *
   */
  async next() {
    if (this.closed) {
      throw new Exception("Wizard already closed, no next step is available");
    }

    let n = await this.subs.subscribe();

    if (n.type() === NEXT_DONE) {
      this.close();
      this.done(n);
    }

    return new Next(n);
  }

  /**
   * Return whether or not the command is started
   *
   * @returns {boolean} True when the command already started, false otherwise
   *
   */
  started() {
    return this.built.started();
  }

  /**
   * Return the name of the control info of current wizard
   *
   * @returns {object}
   *
   */
  control() {
    return this.built.control();
  }

  /**
   * Close current wizard
   *
   * @returns {any} Close result
   *
   */
  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;

    return this.built.close();
  }
}

/**
 * Read-only snapshot of a command's identity metadata.
 *
 * Passed into command wizard/execute/launch callbacks so they can reference the
 * command name, description, and theme color without holding a reference to the
 * full {@link Builder}.
 */
export class Info {
  /**
   * constructor
   *
   * @param {Builder} info The builder whose metadata is captured.
   *
   */
  constructor(info) {
    this.type = info.name();
    this.info = info.description();
    this.tcolor = info.color();
  }

  /**
   * Return command name
   *
   * @returns {string} Command name
   *
   */
  name() {
    return this.type;
  }

  /**
   * Return command description
   *
   * @returns {string} Command description
   *
   */
  description() {
    return this.info;
  }

  /**
   * Return the theme color of the command
   *
   * @returns {string} Command name
   *
   */
  color() {
    return this.tcolor;
  }
}

/**
 * Wraps a raw command definition and provides the `wizard`, `execute`,
 * `launch`, and `launcher` entry points consumed by the Sshwifty UI.
 *
 * Each method returns a {@link Wizard} that the UI drives by repeatedly
 * calling {@link Wizard#next}.
 *
 * @private
 */
class Builder {
  /**
   * constructor
   *
   * @param {object} command Raw command definition implementing `id()`, `name()`,
   *   `description()`, `color()`, `wizard()`, `execute()`, `launch()`,
   *   `launcher()`, and `represet()`.
   *
   */
  constructor(command) {
    this.cid = command.id();
    this.represeter = (n) => {
      return command.represet(n);
    };
    this.wizarder = (n, i, r, u, y, x, l, p) => {
      return command.wizard(n, i, r, u, y, x, l, p);
    };
    this.executer = (n, i, r, u, y, x, l, p) => {
      return command.execute(n, i, r, u, y, x, l, p);
    };
    this.launchCmd = (n, i, r, u, y, x) => {
      return command.launch(n, i, r, u, y, x);
    };
    this.launcherCmd = (c) => {
      return command.launcher(c);
    };
    this.type = command.name();
    this.info = command.description();
    this.tcolor = command.color();
  }

  /**
   * Return the command ID
   *
   * @returns {number} Command ID
   *
   */
  id() {
    return this.cid;
  }

  /**
   * Return command name
   *
   * @returns {string} Command name
   *
   */
  name() {
    return this.type;
  }

  /**
   * Return command description
   *
   * @returns {string} Command description
   *
   */
  description() {
    return this.info;
  }

  /**
   * Return the theme color of the command
   *
   * @returns {string} Command name
   *
   */
  color() {
    return this.tcolor;
  }

  /**
   * Execute an automatic command wizard
   *
   * @param {stream.Streams} streams
   * @param {controls.Controls} controls
   * @param {history.History} history
   * @param {presets.Preset} preset
   * @param {object} session
   * @param {Array<string>} keptSessions
   * @param {function} done Callback which will be called when wizard is done
   *
   * @returns {Wizard} Command wizard
   *
   */
  wizard(streams, controls, history, preset, session, keptSessions, done) {
    let subs = new subscribe.Subscribe();

    return new Wizard(
      this.wizarder(
        new Info(this),
        preset,
        session,
        keptSessions,
        streams,
        subs,
        controls,
        history,
      ),
      subs,
      done,
    );
  }

  /**
   * Execute an automatic command wizard
   *
   * @param {stream.Streams} streams
   * @param {controls.Controls} controls
   * @param {history.History} history
   * @param {object} config
   * @param {object} session
   * @param {Array<string>} keptSessions
   * @param {function} done Callback which will be called when wizard is done
   *
   * @returns {Wizard} Command wizard
   *
   */
  execute(streams, controls, history, config, session, keptSessions, done) {
    let subs = new subscribe.Subscribe();

    return new Wizard(
      this.executer(
        new Info(this),
        config,
        session,
        keptSessions,
        streams,
        subs,
        controls,
        history,
      ),
      subs,
      done,
    );
  }

  /**
   * Launch command wizard out of given launcher string
   *
   * @param {stream.Streams} streams
   * @param {controls.Controls} controls
   * @param {history.History} history
   * @param {string} launcher Launcher format
   * @param {function} done Callback which will be called when launching is done
   *
   * @returns {Wizard} Command wizard
   *
   */
  launch(streams, controls, history, launcher, done) {
    let subs = new subscribe.Subscribe();

    return new Wizard(
      this.launchCmd(
        new Info(this),
        decodeURI(launcher),
        streams,
        subs,
        controls,
        history,
      ),
      subs,
      done,
    );
  }

  /**
   * Build launcher string out of given config
   *
   * @param {object} config Configuration object
   *
   * @return {string} Launcher string
   */
  launcher(config) {
    return this.name() + ":" + encodeURI(this.launcherCmd(config));
  }

  /**
   * Reconfigure the preset data for the command wizard
   *
   * @param {presets.Preset} n preset
   *
   * @return {presets.Preset} modified new preset
   */
  represet(n) {
    return this.represeter(n);
  }
}

/**
 * Pairs a {@link presets.Preset} with the {@link Builder} that owns it,
 * as returned by {@link Commands#mergePresets}.
 */
export class Preset {
  /**
   * constructor
   *
   * @param {presets.Preset} preset The preset data.
   * @param {Builder} command The command builder associated with this preset.
   *
   */
  constructor(preset, command) {
    this.preset = preset;
    this.command = command;
  }
}

/**
 * Registry of all available command types.
 *
 * Wraps each raw command definition in a {@link Builder} and exposes helper
 * methods for listing, selecting, and merging commands with preset data.
 */
export class Commands {
  /**
   * constructor
   *
   * @param {Array<object>} commands Array of raw command definitions (e.g.
   *   `[new ssh.Command(), new telnet.Command()]`).
   *
   */
  constructor(commands) {
    this.commands = [];

    for (let i = 0; i < commands.length; i++) {
      this.commands.push(new Builder(commands[i]));
    }
  }

  /**
   * Return all commands
   *
   * @returns {Array<Builder>} A group of command
   *
   */
  all() {
    return this.commands;
  }

  /**
   * Select one command
   *
   * @param {number} id Command ID
   *
   * @returns {Builder} Command builder
   *
   */
  select(id) {
    return this.commands[id];
  }

  /**
   * Returns presets with merged command
   *
   * @param {presets.Presets} ps
   *
   * @returns {Array<Preset>}
   *
   */
  mergePresets(ps) {
    let pp = [];

    for (let i = 0; i < this.commands.length; i++) {
      const fetched = ps.fetch(this.commands[i].name());

      for (let j = 0; j < fetched.length; j++) {
        pp.push(
          new Preset(this.commands[i].represet(fetched[j]), this.commands[i]),
        );
      }
    }

    return pp;
  }
}
