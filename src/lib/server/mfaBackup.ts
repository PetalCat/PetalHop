import { randomBytes, createHash, timingSafeEqual } from 'crypto';

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8; // 8 characters per code

/**
 * Generate a set of backup codes
 * Returns both plain codes (to show user once) and hashed codes (to store)
 */
export function generateBackupCodes(): { plainCodes: string[]; hashedCodes: string[] } {
	const plainCodes: string[] = [];
	const hashedCodes: string[] = [];

	for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
		// Generate random code (alphanumeric, easy to type)
		const code = randomBytes(BACKUP_CODE_LENGTH)
			.toString('base64')
			.replace(/[^a-zA-Z0-9]/g, '')
			.substring(0, BACKUP_CODE_LENGTH)
			.toUpperCase();

		plainCodes.push(code);
		hashedCodes.push(hashBackupCode(code));
	}

	return { plainCodes, hashedCodes };
}

/**
 * Hash a backup code for storage
 */
export function hashBackupCode(code: string): string {
	return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

/**
 * Verify a backup code against stored hashed codes
 * Returns the index of the used code if valid, -1 if invalid
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
	const inputHash = hashBackupCode(code);
	const inputBuffer = Buffer.from(inputHash, 'hex');

	for (let i = 0; i < hashedCodes.length; i++) {
		const storedBuffer = Buffer.from(hashedCodes[i], 'hex');
		if (storedBuffer.length === inputBuffer.length && timingSafeEqual(inputBuffer, storedBuffer)) {
			return i;
		}
	}

	return -1;
}

/**
 * Remove a used backup code from the list
 */
export function removeBackupCode(hashedCodes: string[], index: number): string[] {
	return hashedCodes.filter((_, i) => i !== index);
}
