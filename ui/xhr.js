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
 * @file xhr.js
 * @description Minimal XHR helpers for HTTP requests used by the Sshwifty
 * authentication and keep-alive flows. Wraps XMLHttpRequest in Promises and
 * exposes `get` and `options` convenience exports.
 */

/**
 * Sends an asynchronous XHR request and returns a promise that resolves with
 * the completed `XMLHttpRequest` object, or rejects on network/timeout error.
 *
 * @private
 * @param {string} method - HTTP method (e.g. `"GET"`, `"OPTIONS"`).
 * @param {string} url - Target URL.
 * @param {Object.<string, string>} headers - Map of request header name → value.
 * @returns {Promise<XMLHttpRequest>} Resolves with the finished XHR instance,
 *   giving callers access to status, response text, and headers.
 * @throws Will reject if the request encounters a network error or times out.
 */
function send(method, url, headers) {
  return new Promise((res, rej) => {
    let authReq = new XMLHttpRequest();

    authReq.addEventListener("readystatechange", () => {
      if (authReq.readyState !== authReq.DONE) {
        return;
      }

      res(authReq);
    });

    authReq.addEventListener("error", (e) => {
      rej(e);
    });

    authReq.addEventListener("timeout", (e) => {
      rej(e);
    });

    authReq.open(method, url, true);

    for (let h in headers) {
      authReq.setRequestHeader(h, headers[h]);
    }

    authReq.send();
  });
}

/**
 * Issues an HTTP GET request.
 *
 * @param {string} url - Target URL.
 * @param {Object.<string, string>} headers - Additional request headers.
 * @returns {Promise<XMLHttpRequest>} Resolves with the completed XHR instance.
 */
export function get(url, headers) {
  return send("GET", url, headers);
}

/**
 * Issues an HTTP OPTIONS request, used as a keep-alive ping for the backend
 * WebSocket endpoint to prevent idle connection drops by proxies.
 *
 * @param {string} url - Target URL.
 * @param {Object.<string, string>} headers - Additional request headers.
 * @returns {Promise<XMLHttpRequest>} Resolves with the completed XHR instance.
 */
export function options(url, headers) {
  return send("OPTIONS", url, headers);
}
