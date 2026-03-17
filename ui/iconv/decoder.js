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
 * Decode a stream that was encoded with specified `charset`, and output the
 * decoded string with `output`
 *
 * @param {function} output a callback to output decoded stream
 * @param {string} charset the charset which the stream is encoded in
 *
 */
export class IconvDecoder {
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
   * Write encoded string into current decoder
   *
   * @param {Uint8Array} b the encoded stream
   *
   */
  write(b) {
    try {
      return this.decoder.write(b);
    } catch (e) {
      // Ignore decoding error
    }
  }

  /**
   * Closes current decoder
   *
   */
  close() {
    try {
      return this.decoder.end();
    } catch (e) {
      // Ignore decoding error
    }
  }
}
