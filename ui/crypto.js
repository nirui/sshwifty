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
 * @file crypto.js
 * @description Cryptographic helpers used by the Sshwifty session layer.
 * Provides HMAC-SHA-512 key derivation and AES-128-GCM encrypt/decrypt
 * primitives built on the browser Web Crypto API (`window.crypto.subtle`).
 */

/**
 * Computes HMAC-SHA-512 of `data` using `secret` as the signing key.
 *
 * @param {Uint8Array} secret - Raw bytes of the HMAC secret key.
 * @param {Uint8Array} data - Plaintext data to sign.
 * @returns {Promise<ArrayBuffer>} Resolves with the 64-byte HMAC signature.
 */
export async function hmac512(secret, data) {
  const key = await window.crypto.subtle.importKey(
    "raw",
    secret,
    {
      name: "HMAC",
      hash: { name: "SHA-512" },
    },
    false,
    ["sign", "verify"],
  );

  return window.crypto.subtle.sign(key.algorithm, key, data);
}

/** @type {number} Length in bytes of an AES-GCM nonce (IV). */
export const GCMNonceSize = 12;
/** @type {number} AES-GCM key length in bits (AES-128). */
export const GCMKeyBitLen = 128;

/**
 * Imports raw key bytes as an AES-128-GCM `CryptoKey` for use with
 * {@link encryptGCM} and {@link decryptGCM}.
 *
 * @param {Uint8Array} keyData - Raw 16-byte key material.
 * @returns {Promise<CryptoKey>} Imported non-extractable AES-GCM key.
 */
export function buildGCMKey(keyData) {
  return window.crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "AES-GCM",
      length: GCMKeyBitLen,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts `plaintext` with AES-128-GCM using `key` and `iv`.
 *
 * The resulting ciphertext includes the 16-byte GCM authentication tag appended
 * at the end (Web Crypto API default behaviour).
 *
 * @param {CryptoKey} key - AES-GCM key imported via {@link buildGCMKey}.
 * @param {Uint8Array} iv - 12-byte nonce; must not be reused with the same key.
 * @param {Uint8Array} plaintext - Data to encrypt.
 * @returns {Promise<ArrayBuffer>} Ciphertext with authentication tag.
 */
export function encryptGCM(key, iv, plaintext) {
  return window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, tagLength: GCMKeyBitLen },
    key,
    plaintext,
  );
}

/**
 * Decrypts an AES-128-GCM ciphertext (including the authentication tag).
 *
 * @param {CryptoKey} key - AES-GCM key imported via {@link buildGCMKey}.
 * @param {Uint8Array} iv - 12-byte nonce used during encryption.
 * @param {Uint8Array} cipherText - Ciphertext with the 16-byte authentication tag.
 * @returns {Promise<ArrayBuffer>} Decrypted plaintext.
 * @throws {DOMException} If the authentication tag verification fails (tampered data).
 */
export function decryptGCM(key, iv, cipherText) {
  return window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, tagLength: GCMKeyBitLen },
    key,
    cipherText,
  );
}

/**
 * Generates a cryptographically random {@link GCMNonceSize}-byte nonce.
 *
 * The returned nonce should be sent to the remote peer so both sides can
 * independently increment it via {@link increaseNonce} to maintain
 * synchronized per-message IVs.
 *
 * @returns {Uint8Array} A fresh 12-byte random nonce.
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
