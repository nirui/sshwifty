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

import * as streams from "./stream/streams.js";
import * as reader from "./stream/reader.js";
import * as sender from "./stream/sender.js";
import * as crypt from "./crypto.js";

export const ECHO_FAILED = streams.ECHO_FAILED;

const maxSenderDelay = 200;
const minSenderDelay = 30;

class Dial {
  /**
   * constructor
   *
   * @param {string} address Address to the Websocket server
   * @param {number} Dial timeout
   * @param {object} privateKey String key that will be used to encrypt and
   *                            decrypt socket traffic
   *
   */
  constructor(address, timeout, privateKey) {
    this.address = address;
    this.timeout = timeout;
    this.privateKey = privateKey;
  }

  /**
   * Connect to the remote server
   *
   * @param {number} timeout Connect timeout
   *
   * @returns {Promise<WebSocket>} When connection is established
   *
   */
  connect(timeout) {
    return new Promise((resolve, reject) => {
      let ws = new WebSocket(this.address),
        promised = false,
        timeoutTimer = setTimeout(() => {
          ws.close();
        }, timeout),
        myRes = w => {
          if (promised) {
            return;
          }

          clearTimeout(timeoutTimer);
          promised = true;

          return resolve(w);
        },
        myRej = e => {
          if (promised) {
            return;
          }

          clearTimeout(timeoutTimer);
          promised = true;

          return reject(e);
        };

      ws.addEventListener("open", _event => {
        myRes(ws);
      });

      ws.addEventListener("close", event => {
        event.toString = () => {
          return "WebSocket Error (" + event.code + ")";
        };

        myRej(event);
      });

      ws.addEventListener("error", _event => {
        ws.close();
      });
    });
  }

  /**
   * Build an socket encrypt and decrypt key string
   *
   */
  async buildKeyString() {
    const enc = new TextEncoder();

    let rTime = Number(Math.trunc(new Date().getTime() / 100000)),
      key = await crypt.hmac512(
        enc.encode(await this.privateKey.fetch()),
        enc.encode(rTime)
      );

    return key.slice(0, 16);
  }

  /**
   * Build encrypt and decrypt key
   *
   */
  async buildKey() {
    let kStr = await this.buildKeyString();

    return await crypt.buildGCMKey(kStr);
  }

  /**
   * Connect to the server
   *
   * @param {object} callbacks Callbacks
   *
   * @returns {object} A pair of ReadWriter which can be used to read and
   *                   send data to the underlaying websocket connection
   *
   */
  async dial(callbacks) {
    let ws = await this.connect(this.timeout),
      rd = new reader.Reader(new reader.Multiple(() => {}), data => {
        return new Promise(resolve => {
          let bufferReader = new FileReader();

          bufferReader.onload = event => {
            let d = new Uint8Array(event.target.result);

            resolve(d);

            callbacks.inboundUnpacked(d);
          };

          bufferReader.readAsArrayBuffer(data);
        });
      });

    ws.addEventListener("message", event => {
      callbacks.inbound(event.data);

      rd.feed(event.data);
    });

    ws.addEventListener("error", event => {
      event.toString = () => {
        return (
          "WebSocket Error (" + (event.code ? event.code : "Unknown") + ")"
        );
      };

      rd.closeWithReason(event);
    });

    ws.addEventListener("close", _event => {
      rd.closeWithReason("Connection is closed");
    });

    let sdDataConvert = rawData => {
        return rawData;
      },
      getSdDataConvert = () => {
        return sdDataConvert;
      },
      sd = new sender.Sender(
        async rawData => {
          try {
            let data = await getSdDataConvert()(rawData);

            ws.send(data.buffer);
            callbacks.outbound(data);
          } catch (e) {
            ws.close();
            rd.closeWithReason(e);

            if (process.env.NODE_ENV === "development") {
              console.error(e);
            }

            throw e;
          }
        },
        4096 - 64, // Server has a 4096 bytes receive buffer, can be no greater,
        minSenderDelay, // 30ms input delay
        10 // max 10 buffered requests
      );

    let senderNonce = crypt.generateNonce();
    sd.send(senderNonce);

    let receiverNonce = await reader.readN(rd, crypt.GCMNonceSize);

    let key = await this.buildKey();

    sdDataConvert = async rawData => {
      let encoded = await crypt.encryptGCM(key, senderNonce, rawData);

      crypt.increaseNonce(senderNonce);

      let dataToSend = new Uint8Array(encoded.byteLength + 2);

      dataToSend[0] = (encoded.byteLength >> 8) & 0xff;
      dataToSend[1] = encoded.byteLength & 0xff;

      dataToSend.set(new Uint8Array(encoded), 2);

      return dataToSend;
    };

    let cgmReader = new reader.Multiple(async r => {
      try {
        let dSizeBytes = await reader.readN(rd, 2),
          dSize = 0;

        dSize = dSizeBytes[0];
        dSize <<= 8;
        dSize |= dSizeBytes[1];

        let decoded = await crypt.decryptGCM(
          key,
          receiverNonce,
          await reader.readN(rd, dSize)
        );

        crypt.increaseNonce(receiverNonce);

        r.feed(new reader.Buffer(new Uint8Array(decoded), () => {}), () => {});
      } catch (e) {
        r.closeWithReason(e);
      }
    });

    return {
      reader: cgmReader,
      sender: sd,
      ws: ws
    };
  }
}

export class Socket {
  /**
   * constructor
   *
   * @param {string} address Address of the WebSocket server
   * @param {object} privateKey String key that will be used to encrypt and
   *                            decrypt socket traffic
   * @param {number} timeout Dial timeout
   * @param {number} echoInterval Echo interval
   */
  constructor(address, privateKey, timeout, echoInterval) {
    this.dial = new Dial(address, timeout, privateKey);
    this.echoInterval = echoInterval;
    this.streamHandler = null;
  }

  /**
   * Return a stream handler
   *
   * @param {object} callbacks A group of callbacks to call when needed
   *
   * @returns {Promise<streams.Streams>} The stream manager
   *
   */
  async get(callbacks) {
    let self = this;

    if (this.streamHandler) {
      return this.streamHandler;
    }

    callbacks.connecting();

    const receiveToPauseFactor = 6,
      minReceivedToPause = 1024 * 16;

    let streamPaused = false,
      currentReceived = 0,
      currentUnpacked = 0;

    const shouldPause = () => {
      return (
        currentReceived > minReceivedToPause &&
        currentReceived > currentUnpacked * receiveToPauseFactor
      );
    };

    try {
      let conn = await this.dial.dial({
        inbound(data) {
          currentReceived += data.size;

          callbacks.traffic(data.size, 0);
        },
        inboundUnpacked(data) {
          currentUnpacked += data.length;

          if (currentUnpacked >= currentReceived) {
            currentUnpacked = 0;
            currentReceived = 0;
          }

          if (self.streamHandler !== null) {
            if (streamPaused && !shouldPause()) {
              streamPaused = false;
              self.streamHandler.resume();

              return;
            } else if (!streamPaused && shouldPause()) {
              streamPaused = true;
              self.streamHandler.pause();

              return;
            }
          }
        },
        outbound(data) {
          callbacks.traffic(0, data.length);
        }
      });

      let streamHandler = new streams.Streams(conn.reader, conn.sender, {
        echoInterval: self.echoInterval,
        echoUpdater(delay) {
          const sendDelay = delay / 2;

          if (sendDelay > maxSenderDelay) {
            conn.sender.setDelay(maxSenderDelay);
          } else if (sendDelay < minSenderDelay) {
            conn.sender.setDelay(minSenderDelay);
          } else {
            conn.sender.setDelay(sendDelay);
          }

          return callbacks.echo(delay);
        },
        cleared(e) {
          if (self.streamHandler === null) {
            return;
          }

          self.streamHandler = null;

          // Close connection first otherwise we may
          // risk sending things out
          conn.ws.close();
          callbacks.close(e);
        }
      });

      callbacks.connected();

      streamHandler.serve().catch(e => {
        if (process.env.NODE_ENV !== "development") {
          return;
        }

        console.trace(e);
      });

      this.streamHandler = streamHandler;
    } catch (e) {
      callbacks.failed(e);

      throw e;
    }

    return this.streamHandler;
  }
}
