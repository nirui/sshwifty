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
//

import * as common from "./common.js";

// NativeDecoder is removed because it rely on `subscribe.Subscribe` which
// currently has bad implementation
// export class NativeDecoder {
//   constructor(output, charset) {
//     let self = this;
//     return (async (output, charset) => {
//       let startSubs = new subscribe.Subscribe();
//       self.source = new ReadableStream({
//         start(controller) {
//           startSubs.resolve(controller);
//         },
//       });
//       self.ctl = await startSubs.subscribe();
//       self.source
//         .pipeThrough(new TextDecoderStream(charset, {}))
//         .pipeTo(new WritableStream({ write: output }));
//       return self;
//     })(output, charset);
//   }

//   write(b) {
//     return this.ctl.enqueue(b);
//   }

//   close() {
//     return this.ctl.close();
//   }
// }

/**
 * @file iconv/decoder.js
 * @description Charset-aware stream decoder backed by iconv-lite. Consumes raw
 * byte arrays and emits decoded strings to a caller-supplied output callback.
 */

/**
 * Streaming charset decoder.
 *
 * Wraps an iconv-lite decode stream for the given `charset`. Decoded string
 * chunks are delivered to `output` via the stream `"data"` event. Errors from
 * both decoding and the output callback are silently swallowed to keep the
 * session alive in the presence of malformed data.
 */
export class IconvDecoder {
  /**
   * Creates a new `IconvDecoder` and opens the underlying iconv decode stream.
   *
   * @param {function(string): void} output - Callback invoked with each decoded
   *   string chunk produced by the decoder.
   * @param {string} charset - The source charset (e.g. `"UTF-8"`, `"Shift-JIS"`).
   *   Must be a value from {@link module:iconv/common.charset}.
   */
  constructor(output, charset) {
    this.out = output;
    this.decoder = common.Iconv.decodeStream(charset);
    this.decoder.on("data", (o) => {
      try {
        return output(o);
      } catch (e) {
        // Ignore output error
      }
    });
    return this;
  }

  /**
   * Writes a raw byte buffer into the decoder stream for charset conversion.
   *
   * The decoded string output is delivered asynchronously to the `output`
   * callback. Decoding errors (e.g. invalid byte sequences) are silently ignored.
   *
   * @param {Uint8Array} b - Raw bytes encoded in the session charset.
   * @returns {void}
   */
  write(b) {
    try {
      return this.decoder.write(b);
    } catch (e) {
      // Ignore decoding error
    }
  }

  /**
   * Flushes and closes the underlying decode stream.
   *
   * After calling `close`, any subsequent `write` calls will have no effect.
   * Errors during stream termination are silently ignored.
   *
   * @returns {void}
   */
  close() {
    try {
      return this.decoder.end();
    } catch (e) {
      // Ignore decoding error
    }
  }
}
