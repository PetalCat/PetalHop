import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { encodeBase32, decodeBase32 } from '@oslojs/encoding';
import { sha1 } from '@oslojs/crypto/sha1';

const scryptAsync = promisify(scrypt);

// Password hashing parameters
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

/**
 * Hash a password using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS) as Buffer;
    return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const [saltHex, keyHex] = hash.split(':');
    if (!saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const storedKey = Buffer.from(keyHex, 'hex');
    const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS) as Buffer;

    return timingSafeEqual(storedKey, derivedKey);
}

/**
 * Generate a random TOTP secret (20 bytes, base32 encoded)
 */
export function generateTotpSecret(): string {
    const bytes = randomBytes(20);
    return encodeBase32(new Uint8Array(bytes));
}

/**
 * Generate TOTP code for a given secret and time
 */
export function generateTotpCode(secret: string, timeStep: number = 30): string {
    const secretBytes = decodeBase32(secret);
    const counter = Math.floor(Date.now() / 1000 / timeStep);
    const counterBytes = new Uint8Array(8);
    const view = new DataView(counterBytes.buffer);
    view.setBigUint64(0, BigInt(counter), false);

    // HMAC-SHA1
    const hmacResult = hmacSha1(secretBytes, counterBytes);

    // Dynamic truncation
    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const code =
        ((hmacResult[offset] & 0x7f) << 24) |
        ((hmacResult[offset + 1] & 0xff) << 16) |
        ((hmacResult[offset + 2] & 0xff) << 8) |
        (hmacResult[offset + 3] & 0xff);

    return String(code % 1000000).padStart(6, '0');
}

/**
 * Verify TOTP code with ±1 time step tolerance
 */
export function verifyTotpCode(secret: string, code: string, timeStep: number = 30): boolean {
    // Check current time step and ±1
    for (let offset = -1; offset <= 1; offset++) {
        const checkTime = Date.now() + offset * timeStep * 1000;
        const counter = Math.floor(checkTime / 1000 / timeStep);
        const secretBytes = decodeBase32(secret);
        const counterBytes = new Uint8Array(8);
        const view = new DataView(counterBytes.buffer);
        view.setBigUint64(0, BigInt(counter), false);

        const hmacResult = hmacSha1(secretBytes, counterBytes);
        const codeOffset = hmacResult[hmacResult.length - 1] & 0x0f;
        const generatedCode =
            ((hmacResult[codeOffset] & 0x7f) << 24) |
            ((hmacResult[codeOffset + 1] & 0xff) << 16) |
            ((hmacResult[codeOffset + 2] & 0xff) << 8) |
            (hmacResult[codeOffset + 3] & 0xff);

        if (String(generatedCode % 1000000).padStart(6, '0') === code) {
            return true;
        }
    }
    return false;
}

/**
 * Generate TOTP URI for authenticator apps
 */
export function generateTotpUri(secret: string, email: string, issuer: string = 'PetalHop'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Simple HMAC-SHA1 implementation
 */
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
    const blockSize = 64;
    let keyToUse = key;

    if (keyToUse.length > blockSize) {
        keyToUse = sha1(keyToUse);
    }

    const paddedKey = new Uint8Array(blockSize);
    paddedKey.set(keyToUse);

    const ipad = new Uint8Array(blockSize);
    const opad = new Uint8Array(blockSize);

    for (let i = 0; i < blockSize; i++) {
        ipad[i] = paddedKey[i] ^ 0x36;
        opad[i] = paddedKey[i] ^ 0x5c;
    }

    const innerData = new Uint8Array(ipad.length + message.length);
    innerData.set(ipad);
    innerData.set(message, ipad.length);
    const innerHash = sha1(innerData);

    const outerData = new Uint8Array(opad.length + innerHash.length);
    outerData.set(opad);
    outerData.set(innerHash, opad.length);

    return sha1(outerData);
}
