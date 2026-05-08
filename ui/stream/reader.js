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
 * @file Buffered async reader abstractions for the Sshwifty stream layer.
 *
 * Provides {@link Buffer} (a single in-memory read buffer), {@link Multiple}
 * (a chain of Buffers fed asynchronously), {@link Reader} (a renewable source
 * backed by a Subscribe channel), and {@link Limited} (a length-capped
 * wrapper). Helper functions {@link readOne}, {@link readN},
 * {@link readCompletely}, and {@link readUntil} build on top of these classes.
 */

import Exception from "./exception.js";
import * as subscribe from "./subscribe.js";

/**
 * Single-shot in-memory read buffer.
 *
 * Wraps a `Uint8Array` and tracks how many bytes have been consumed. When the
 * buffer is fully drained the `depleted` callback is invoked exactly once.
 */
export class Buffer {
  /**
   * constructor
   *
   * @param {Uint8Array} buffer Array buffer
   * @param {function} depleted Callback that will be called when the buffer
   *                            is depleted
   */
  constructor(buffer, depleted) {
    this.buffer = buffer;
    this.used = 0;
    this.onDepleted = depleted;
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   * @param {number} maxLen Max search length
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  searchBuffer(byteData, maxLen) {
    let searchLen = this.remains();

    if (searchLen > maxLen) {
      searchLen = maxLen;
    }

    for (let i = 0; i < searchLen; i++) {
      if (this.buffer[i + this.used] !== byteData) {
        continue;
      }

      return i;
    }

    return -1;
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  indexOf(byteData) {
    return this.searchBuffer(byteData, this.remains());
  }

  /**
   * Return how many bytes in the source + buffer is still available to be
   * read, return 0 when reader is depleted and thus can be ditched
   *
   * @returns {number} Remaining size
   *
   */
  remains() {
    return this.buffer.length - this.used;
  }

  /**
   * Return how many bytes is still availale in the buffer.
   *
   * Note: This reader don't have renewable data source, so when buffer
   *       depletes, the reader is done
   *
   * @returns {number} Remaining size
   *
   */
  buffered() {
    return this.remains();
  }

  /**
   * Export max n bytes from current buffer
   *
   * @param {number} n suggested max byte length, set to 0 to refresh buffer
   *                   if current buffer is deplated
   *
   * @returns {Uint8Array} Exported data
   *
   * @throws {Exception} When reader has been depleted
   *
   */
  export(n) {
    let remain = this.remains();

    if (remain <= 0) {
      throw new Exception("Reader has been depleted", false);
    }

    if (remain > n) {
      remain = n;
    }

    let exported = this.buffer.slice(this.used, this.used + remain);
    this.used += exported.length;

    if (this.remains() <= 0) {
      this.onDepleted();
    }

    return exported;
  }
}

/**
 * Asynchronous chain of {@link Buffer} readers.
 *
 * New buffers are fed via {@link Multiple#feed}; when the current buffer is
 * exhausted the next one is awaited from the internal {@link Subscribe}
 * channel. The `depleted` callback passed to the constructor is called each
 * time the chain runs dry and begins waiting for a new buffer.
 */
export class Multiple {
  /**
   * Constructor
   *
   * @param {function} depleted Callback will be called when all reader is
   *                            depleted
   *
   */
  constructor(depleted) {
    this.reader = null;
    this.depleted = depleted;
    this.subscribe = new subscribe.Subscribe();
    this.closed = false;
  }

  /**
   * Add new reader as sub reader
   *
   * @param {Buffer} reader
   * @param {function} depleted Callback that will be called when given reader
   *                            is depleted
   *
   * @throws {Exception} When the reader is closed
   *
   */
  feed(reader, depleted) {
    if (this.closed) {
      throw new Exception("Reader is closed", false);
    }

    if (this.reader === null && this.subscribe.pendings() <= 0) {
      this.reader = {
        reader: reader,
        depleted: depleted,
      };

      return;
    }

    this.subscribe.resolve({
      reader: reader,
      depleted: depleted,
    });
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   * @param {number} maxLen Max search length
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   *
   */
  searchBuffer(byteData, maxLen) {
    if (this.reader === null) {
      return -1;
    }

    return this.reader.reader.searchBuffer(byteData, maxLen);
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  indexOf(byteData) {
    return this.searchBuffer(byteData, this.buffered());
  }

  /**
   * Return how many bytes still available in the buffer (How many bytes of
   * buffer is left for read before reloading from data source)
   *
   * @returns {number} How many bytes left in the current buffer
   */
  buffered() {
    if (this.reader == null) {
      return 0;
    }

    return this.reader.reader.buffered();
  }

  /**
   * close current reading
   *
   */
  close() {
    return this.closeWithReason("Reader is closed");
  }

  /**
   * close current reading
   *
   * @param {string} reason Reason
   *
   */
  closeWithReason(reason) {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.subscribe.reject(new Exception(reason, false));
    this.subscribe.disable(reason);
  }

  /**
   * Export max n bytes from current buffer
   *
   * @param {number} n suggested max byte length, set to 0 to refresh buffer
   *                   if current buffer is deplated
   *
   * @returns {Uint8Array} Exported data
   *
   */
  async export(n) {
    for (;;) {
      if (this.reader !== null) {
        let exported = await this.reader.reader.export(n);

        if (this.reader.reader.remains() <= 0) {
          this.reader.depleted();

          this.reader = null;
        }

        return exported;
      }

      this.depleted(this);

      this.reader = await this.subscribe.subscribe();
    }
  }
}

/**
 * Renewable async reader backed by a {@link Subscribe} channel.
 *
 * Callers push raw data buffers via {@link Reader#feed}; the reader makes them
 * available through the async {@link Reader#export} API after optionally
 * transforming each chunk with `bufferConverter`. The underlying
 * {@link Multiple} instance handles sequencing across multiple chunks.
 */
export class Reader {
  /**
   * constructor
   *
   * @param {Multiple} multiple Source reader
   * @param {function} bufferConverter Optional transform applied to each raw
   *   buffer before it is enqueued into the Multiple. Defaults to identity.
   *
   */
  constructor(multiple, bufferConverter) {
    this.multiple = multiple;
    this.buffers = new subscribe.Subscribe();
    this.bufferConverter =
      bufferConverter ||
      ((d) => {
        return d;
      });
    this.closed = false;
  }

  /**
   * Add buffer into current reader
   *
   * @param {Uint8Array} buffer buffer to add
   *
   * @throws {Exception} When the reader is closed
   *
   */
  feed(buffer) {
    if (this.closed) {
      throw new Exception("Reader is closed, new data has been deined", false);
    }

    this.buffers.resolve(buffer);
  }

  /**
   * Returns the underlying {@link Multiple} reader, blocking until at least
   * one byte is available in the buffer. If the multiple already has buffered
   * data it is returned immediately; otherwise the next pending buffer is
   * awaited from the Subscribe channel, converted, and fed into the Multiple.
   *
   * @private
   * @returns {Promise<Multiple>} The underlying multiple reader ready for export.
   * @throws {Exception} When the reader is closed.
   */
  async reader() {
    if (this.closed) {
      throw new Exception("Reader is closed, unable to read", false);
    }

    if (this.multiple.buffered() > 0) {
      return this.multiple;
    }

    let self = this,
      converted = await this.bufferConverter(await self.buffers.subscribe());

    this.multiple.feed(new Buffer(converted, () => {}), () => {});

    return this.multiple;
  }

  /**
   * close current reading
   *
   */
  close() {
    return this.closeWithReason("Reader is closed");
  }

  /**
   * close current reading
   *
   * @param {string} reason Reason
   *
   */
  closeWithReason(reason) {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.buffers.reject(new Exception(reason, false));
    this.buffers.disable(reason);

    return this.multiple.close();
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   * @param {number} maxLen Max search length
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  async searchBuffer(byteData, maxLen) {
    return (await this.reader()).searchBuffer(byteData, maxLen);
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  async indexOf(byteData) {
    return (await this.reader()).indexOf(byteData);
  }

  /**
   * Return how many bytes still available in the buffer (How many bytes of
   * buffer is left for read before reloading from data source)
   *
   * @returns {number} How many bytes left in the current buffer
   */
  async buffered() {
    return (await this.reader()).buffered();
  }

  /**
   * Export max n bytes from current buffer
   *
   * @param {number} n suggested max byte length, set to 0 to refresh buffer
   *                   if current buffer is deplated
   *
   * @returns {Uint8Array} Exported data
   *
   */
  async export(n) {
    return (await this.reader()).export(n);
  }
}

/**
 * Read exactly one bytes from the reader
 *
 * @param {Reader} reader the source reader
 *
 * @returns {Uint8Array} Exported data
 *
 */
export async function readOne(reader) {
  for (;;) {
    let d = await reader.export(1);

    if (d.length <= 0) {
      continue;
    }

    return d;
  }
}

/**
 * Read exactly n bytes from the reader
 *
 * @param {Reader} reader the source reader
 * @param {number} n length to read
 *
 * @returns {Uint8Array} Exported data
 *
 */
export async function readN(reader, n) {
  let readed = 0,
    result = new Uint8Array(n);

  while (readed < n) {
    let exported = await reader.export(n - readed);

    result.set(exported, readed);
    readed += exported.length;
  }

  return result;
}

/**
 * Length-capped wrapper around any reader that supports `export`, `buffered`,
 * `searchBuffer`, and `indexOf`. Prevents reading beyond a declared byte
 * limit, which is necessary for framed protocol messages where each segment
 * has a fixed declared length.
 */
export class Limited {
  /**
   * Constructor
   *
   * @param {Reader} reader the source reader
   * @param {number} maxN max bytes to read from the source before this reader
   *   is considered completed
   *
   */
  constructor(reader, maxN) {
    this.reader = reader;
    this.remain = maxN;
  }

  /**
   * Indicate whether or not the current reader is completed
   *
   * @returns {boolean} true when the reader is completed, false otherwise
   *
   */
  completed() {
    return this.remain <= 0;
  }

  /**
   * Return the index of given byte inside current available (unused) read
   * buffer
   *
   * @param {number} byteData Target data
   * @param {number} maxLen Max search length
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   *
   */
  searchBuffer(byteData, maxLen) {
    return this.reader.searchBuffer(
      byteData,
      maxLen > this.remain ? this.remain : maxLen,
    );
  }

  /**
   * Return the index of given byte inside current read buffer
   *
   * @param {number} byteData Target data
   *
   * @returns {number} Return number >= 0 when found, -1 when not
   */
  indexOf(byteData) {
    return this.reader.searchBuffer(byteData, this.remain);
  }

  /**
   * Return how many bytes still available to be read
   *
   * @returns {number} Remaining size
   *
   */
  remains() {
    return this.remain;
  }

  /**
   * Return how many bytes still available in the buffer (How many bytes of
   * buffer is left for read before reloading from data source)
   *
   * @returns {number} Remaining size
   *
   */
  buffered() {
    let buf = this.reader.buffered();

    return buf > this.remain ? this.remain : buf;
  }

  /**
   * Export max n bytes from current buffer
   *
   * @param {number} n suggested max length
   *
   * @throws {Exception} when reading already completed
   *
   * @returns {Uint8Array} Exported data
   *
   */
  async export(n) {
    if (this.completed()) {
      throw new Exception("Reader already completed", false);
    }

    let toRead = n > this.remain ? this.remain : n,
      exported = await this.reader.export(toRead);

    this.remain -= exported.length;

    return exported;
  }
}

/**
 * Read the whole Limited reader and return the result
 *
 * @param {Limited} limited the Limited reader
 *
 * @returns {Uint8Array} Exported data
 *
 */
export async function readCompletely(limited) {
  return await readN(limited, limited.remains());
}

/**
 * Read bytes from `indexOfReader` until `byteData` is encountered or a
 * chunk boundary is reached.
 *
 * Guaranteed to return at least one byte. The returned `found` flag is `true`
 * when the last byte in `data` equals `byteData`.
 *
 * @param {Reader} indexOfReader Reader that supports `indexOf` and `buffered`.
 * @param {number} byteData Target byte value to search for.
 * @returns {Promise<{data: Uint8Array, found: boolean}>} Object with the bytes
 *   read and whether the delimiter was found in this chunk.
 */
export async function readUntil(indexOfReader, byteData) {
  let pos = await indexOfReader.indexOf(byteData),
    buffered = await indexOfReader.buffered();

  if (pos >= 0) {
    return {
      data: await readN(indexOfReader, pos + 1),
      found: true,
    };
  }

  if (buffered <= 0) {
    let d = await readOne(indexOfReader);

    return {
      data: d,
      found: d[0] === byteData,
    };
  }

  return {
    data: await readN(indexOfReader, buffered),
    found: false,
  };
}
