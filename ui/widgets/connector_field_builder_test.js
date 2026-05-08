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

import assert from "assert";
import * as fieldBuilder from "./connector_field_builder.js";

describe("Connector field builder", () => {
  it("returns the current suggestion for the field value", () => {
    const field = fieldBuilder.build(1, 0, {
      name: "Host",
      type: "text",
      value: "example.com",
      readonly: false,
      example: "",
      description: "",
      verify: () => null,
      suggestions: () => [],
    });

    assert.deepStrictEqual(field.currentSuggestion(), {
      title: "Input",
      value: "example.com",
      fields: {},
    });
  });
});
