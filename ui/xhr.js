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

export function get(url, headers) {
  return new Promise((res, rej) => {
    let authReq = new XMLHttpRequest();

    authReq.onreadystatechange = () => {
      if (authReq.readyState !== authReq.DONE) {
        return;
      }

      res(authReq);
    };

    authReq.onerror = e => {
      rej(e);
    };

    authReq.ontimeout = e => {
      rej(e);
    };

    authReq.open("GET", url, true);

    for (let h in headers) {
      authReq.setRequestHeader(h, headers[h]);
    }

    authReq.send();
  });
}
