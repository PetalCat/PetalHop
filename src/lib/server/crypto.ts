import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Get or derive the encryption key from environment variable.
 * If ENCRYPTION_KEY is not set, uses a default derived from DATABASE_URL.
 * For production, always set ENCRYPTION_KEY to a secure random value.
 */
function getEncryptionKey(): Buffer {
	const envKey = env.ENCRYPTION_KEY;
	if (envKey) {
		// Use provided key (should be 32 bytes hex-encoded = 64 chars)
		if (envKey.length === 64) {
			return Buffer.from(envKey, 'hex');
		}
		// Derive from provided string
		return scryptSync(envKey, 'petalhop-salt', 32);
	}

	// Fallback: derive from DATABASE_URL (not recommended for production)
	const dbUrl = env.DATABASE_URL || 'petalhop-default-key';
	return scryptSync(dbUrl, 'petalhop-salt', 32);
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing: salt + iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Combine iv + authTag + ciphertext
	const combined = Buffer.concat([iv, authTag, encrypted]);
	return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Returns the original plaintext.
 */
export function decrypt(encryptedBase64: string): string {
	const key = getEncryptionKey();
	const combined = Buffer.from(encryptedBase64, 'base64');

	// Extract components
	const iv = combined.subarray(0, IV_LENGTH);
	const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString('utf8');
}

/**
 * Check if a string appears to be encrypted (base64 with minimum length for iv + tag)
 */
export function isEncrypted(value: string): boolean {
	// Minimum length: IV (12) + AuthTag (16) = 28 bytes = ~38 base64 chars
	if (value.length < 38) return false;
	// Check if it's valid base64
	try {
		const decoded = Buffer.from(value, 'base64');
		return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH;
	} catch {
		return false;
	}
}

/**
 * Safely decrypt a value that might or might not be encrypted.
 * Returns the original value if decryption fails (for migration purposes).
 */
export function safeDecrypt(value: string): string {
	if (!value || !isEncrypted(value)) {
		return value;
	}
	try {
		return decrypt(value);
	} catch {
		// Value was not encrypted or key changed, return as-is
		return value;
	}
}
