// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2021 NI Rui <ranqus@gmail.com>
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

export function get(url, headers) {
  return send("GET", url, headers);
}

export function options(url, headers) {
  return send("OPTIONS", url, headers);
}
