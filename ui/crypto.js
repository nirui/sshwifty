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

/**
 * Generate HMAC 512 of given data
 *
 * @param {Uint8Array} secret Secret key
 * @param {Uint8Array} data Data to be HMAC'ed
 */
export async function hmac512(secret, data) {
  const key = await window.crypto.subtle.importKey(
    "raw",
    secret,
    {
      name: "HMAC",
      hash: { name: "SHA-512" }
    },
    false,
    ["sign", "verify"]
  );

  return window.crypto.subtle.sign(key.algorithm, key, data);
}

export const GCMNonceSize = 12;
export const GCMKeyBitLen = 128;

/**
 * Build AES GCM Encryption/Decryption key
 *
 * @param {Uint8Array} keyData Key data
 */
export function buildGCMKey(keyData) {
  return window.crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "AES-GCM",
      length: GCMKeyBitLen
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data
 *
 * @param {CryptoKey} key Key
 * @param {Uint8Array} iv Nonce
 * @param {Uint8Array} plaintext Data to be encrypted
 */
export function encryptGCM(key, iv, plaintext) {
  return window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, tagLength: GCMKeyBitLen },
    key,
    plaintext
  );
}

/**
 * Decrypt data
 *
 * @param {CryptoKey} key Key
 * @param {Uint8Array} iv Nonce
 * @param {Uint8Array} cipherText Data to be decrypted
 */
export function decryptGCM(key, iv, cipherText) {
  return window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, tagLength: GCMKeyBitLen },
    key,
    cipherText
  );
}

/**
 * generate Random nonce
 *
 */
export function generateNonce() {
  return window.crypto.getRandomValues(new Uint8Array(GCMNonceSize));
}

/**
 * Increase nonce by one
 *
 * @param {Uint8Array} nonce Nonce data
 *
 * @returns {Uint8Array} New nonce
 *
 */
export function increaseNonce(nonce) {
  for (let i = nonce.length; i > 0; i--) {
    nonce[i - 1]++;

    if (nonce[i - 1] <= 0) {
      continue;
    }

    break;
  }

  return nonce;
}
