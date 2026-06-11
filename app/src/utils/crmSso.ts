/**
 * GHL SSO blob decrypt utility — CryptoJS-AES-compatible (OpenSSL "Salted__" scheme).
 *
 * Ported from PTV2 `src/utils/crmClient.ts:1067-1115`.
 * Pure Node `crypto` — no new npm dependencies.
 *
 * Algorithm:
 *   base64 → if "Salted__" prefix:
 *     salt = bytes[8..16], ciphertext = bytes[16+]
 *     EVP_BytesToKey(password, salt) → 32-byte key + 16-byte IV (MD5 rounds)
 *     AES-256-CBC decrypt → JSON.parse
 *   else fallback iv:hex format:
 *     split on ':', iv = hex-decode first part, key = first 32 bytes of password utf8
 *     AES-256-CBC decrypt → JSON.parse
 */

import crypto from 'crypto';

export interface CrmSsoPayload {
  activeLocation: string;
  companyId?: string;
  userId?: string;
  email?: string;
  role?: string;
  type?: string;
  [k: string]: unknown;
}

/**
 * Derive OpenSSL EVP_BytesToKey key+IV from a password and salt.
 * Uses MD5 rounds to produce 32 bytes key + 16 bytes IV (CryptoJS default).
 */
function evpBytesToKey(password: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const keyLen = 32;
  const ivLen = 16;
  const target = keyLen + ivLen;
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < target) {
    block = crypto
      .createHash('md5')
      .update(Buffer.concat([block, Buffer.from(password, 'utf8'), salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

/**
 * Decrypt a GHL SSO blob.
 *
 * @param ssoData - Base64-encoded encrypted blob from GHL (OpenSSL salted format or iv:hex fallback)
 * @param key     - The app's SSO key (from GHL Marketplace → App Settings → SSO Key)
 * @returns Parsed JSON payload containing at minimum `activeLocation`
 * @throws Error on malformed/truncated blob, wrong key, or non-JSON payload
 */
export function decryptCrmSso(ssoData: string, key: string): CrmSsoPayload {
  if (!ssoData || !key) {
    throw new Error('ssoData and key are required');
  }

  // Salted__ path (standard CryptoJS/OpenSSL output)
  const buf = Buffer.from(ssoData, 'base64');
  if (buf.length >= 16 && buf.subarray(0, 8).toString('binary') === 'Salted__') {
    const salt = buf.subarray(8, 16);
    const encrypted = buf.subarray(16);
    const { key: derivedKey, iv } = evpBytesToKey(key, salt);
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as CrmSsoPayload;
  }

  // Fallback: iv:ciphertext hex format
  const parts = ssoData.split(':');
  if (parts.length < 2) {
    throw new Error('Invalid SSO blob: not Salted__ format and not iv:ciphertext format');
  }
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encBuf = Buffer.from(parts.join(':'), 'hex');
  const keyBuffer = Buffer.from(key, 'utf8').subarray(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encBuf);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as CrmSsoPayload;
}
