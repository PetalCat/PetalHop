export interface PasswordValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate password against security policy
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
	const errors: string[] = [];

	if (password.length < 12) {
		errors.push('Password must be at least 12 characters');
	}

	if (!/[A-Z]/.test(password)) {
		errors.push('Password must contain at least one uppercase letter');
	}

	if (!/[a-z]/.test(password)) {
		errors.push('Password must contain at least one lowercase letter');
	}

	if (!/[0-9]/.test(password)) {
		errors.push('Password must contain at least one number');
	}

	if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
		errors.push('Password must contain at least one special character');
	}

	// Check for common weak patterns
	const commonPatterns = [
		/^123456/,
		/password/i,
		/qwerty/i,
		/abc123/i,
		/admin/i,
		/letmein/i,
		/welcome/i,
		/monkey/i,
		/dragon/i
	];

	for (const pattern of commonPatterns) {
		if (pattern.test(password)) {
			errors.push('Password contains a common weak pattern');
			break;
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Get password requirements for display to users
 */
export function getPasswordRequirements(): string[] {
	return [
		'At least 12 characters',
		'At least one uppercase letter (A-Z)',
		'At least one lowercase letter (a-z)',
		'At least one number (0-9)',
		'At least one special character (!@#$%^&*...)'
	];
}
