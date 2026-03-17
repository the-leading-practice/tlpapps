import crypto from 'crypto';
import { config } from '../config.js';

const algorithm = 'aes-256-gcm';

export const cryptoService = {
  encrypt(content: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, config.tokenKey, iv);
    const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
    const tag = cipher.getAuthTag();

    const bufKeys = Buffer.alloc(2);
    bufKeys[0] = iv.length;
    bufKeys[1] = tag.length;

    return Buffer.concat([bufKeys, iv, tag, encrypted]).toString('hex');
  },

  decrypt(hash: Buffer): string {
    const ivLen = hash[0];
    const tagLen = hash[1];
    const iv = hash.subarray(2, 2 + ivLen);
    const tag = hash.subarray(ivLen + 2, tagLen + ivLen + 2);
    const content = hash.subarray(2 + ivLen + tagLen);

    const decipher = crypto.createDecipheriv(algorithm, config.tokenKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString();
  },

  getNewSecret(): string {
    const wishlist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-#$';
    return Array.from(crypto.randomFillSync(new Uint32Array(32)))
      .map((x) => wishlist[x % wishlist.length])
      .join('');
  },
};
