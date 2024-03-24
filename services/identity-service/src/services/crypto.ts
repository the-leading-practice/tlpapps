import crypto from 'crypto';
import { TOKEN_KEY } from 'constants/constants';

const createCryptoService = () => {
  const algorithm = "aes-256-gcm";
  const secret = TOKEN_KEY;

  const encrypt = ( content: string ) => {
    const iv = crypto.randomBytes( 12 );
    const cipher = crypto.createCipheriv( algorithm, secret, iv );
    const encrypted = Buffer.concat( [cipher.update( content ), cipher.final()] );
    const tag = cipher.getAuthTag();

    const hash = {
      iv: iv,
      content: encrypted,
      tag: tag
    }

    const bufKeys = Buffer.alloc(2);
    bufKeys[0] = hash.iv.length;
    bufKeys[1] = hash.tag.length;

    const arr = [bufKeys, hash.iv, hash.tag, hash.content];

    const outBuf = Buffer.concat( arr );

    return outBuf.toString( 'hex' );
  }

  const decrypt = ( hash: Buffer ) => {
    const ivLen = hash[0];
    const tagLen = hash[1];

    const iv = hash.subarray( 2, 2+ivLen );
    const tag = hash.subarray( ivLen+2, tagLen+ivLen+2 );
    const content = hash.subarray( 2+ivLen+tagLen );

    const decipher = crypto.createDecipheriv( algorithm, secret, iv );

    decipher.setAuthTag( tag );
    const decrypted = Buffer.concat( [decipher.update( content ), decipher.final()] );

    return decrypted.toString();
  }

  const getNewSecret = () => {
    const length = 32
    const wishlist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-#$'

    const secret = Array.from( crypto.randomFillSync( new Uint32Array( length ) ) )
      .map( ( x ) => wishlist[x % wishlist.length] )
      .join('');

    return secret;
  }

  const hashString = ( value: string ) => {
    const hash = crypto.createHash( 'sha256' );
    const digest = hash.update( value ).digest( 'hex' );
  }

  return {
    encrypt,
    decrypt,
    getNewSecret,
    hashString
  }
}

export const cryptoService = createCryptoService();
