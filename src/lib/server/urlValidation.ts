import { URL } from 'url';
import dns from 'dns/promises';

// Private/internal IP ranges that should be blocked for SSRF prevention
const PRIVATE_IP_RANGES = [
	/^127\./, // Loopback
	/^10\./, // Class A private
	/^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
	/^192\.168\./, // Class C private
	/^169\.254\./, // Link-local
	/^0\./, // Current network
	/^224\./, // Multicast
	/^240\./, // Reserved
	/^255\./, // Broadcast
	/^localhost$/i,
	/^::1$/, // IPv6 loopback
	/^fc00:/i, // IPv6 private
	/^fe80:/i, // IPv6 link-local
	/^fd/i // IPv6 unique local
];

const BLOCKED_HOSTNAMES = ['localhost', 'localhost.localdomain', '127.0.0.1', '::1', '0.0.0.0'];

/**
 * Check if an IP address is private/internal
 */
function isPrivateIP(ip: string): boolean {
	return PRIVATE_IP_RANGES.some((regex) => regex.test(ip));
}

/**
 * Validate a webhook URL for SSRF safety
 * Returns { valid: true } or { valid: false, error: string }
 */
export async function validateWebhookUrl(
	urlString: string
): Promise<{ valid: true } | { valid: false; error: string }> {
	if (!urlString || urlString.trim() === '') {
		return { valid: true }; // Empty URL is allowed (disables webhook)
	}

	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}

	// Only allow HTTPS (or HTTP for local dev, but warn)
	if (!['https:', 'http:'].includes(url.protocol)) {
		return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
	}

	// Block obviously internal hostnames
	const hostname = url.hostname.toLowerCase();
	if (BLOCKED_HOSTNAMES.includes(hostname)) {
		return { valid: false, error: 'URL cannot point to localhost or internal addresses' };
	}

	// Check for IP address in hostname
	const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
	if (ipv4Regex.test(hostname)) {
		if (isPrivateIP(hostname)) {
			return { valid: false, error: 'URL cannot point to private/internal IP addresses' };
		}
	}

	// Resolve hostname and check resolved IPs
	try {
		const addresses = await dns.resolve4(hostname).catch(() => []);
		const addresses6 = await dns.resolve6(hostname).catch(() => []);
		const allAddresses = [...addresses, ...addresses6];

		for (const addr of allAddresses) {
			if (isPrivateIP(addr)) {
				return {
					valid: false,
					error: 'URL hostname resolves to a private/internal IP address'
				};
			}
		}
	} catch {
		// DNS resolution failed - could be a valid external URL that's temporarily unreachable
		// We'll allow it but the webhook will fail when called
	}

	return { valid: true };
}

/**
 * Synchronous basic validation (for quick checks without DNS lookup)
 */
export function validateWebhookUrlSync(
	urlString: string
): { valid: true } | { valid: false; error: string } {
	if (!urlString || urlString.trim() === '') {
		return { valid: true };
	}

	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}

	if (!['https:', 'http:'].includes(url.protocol)) {
		return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
	}

	const hostname = url.hostname.toLowerCase();
	if (BLOCKED_HOSTNAMES.includes(hostname)) {
		return { valid: false, error: 'URL cannot point to localhost or internal addresses' };
	}

	const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
	if (ipv4Regex.test(hostname) && isPrivateIP(hostname)) {
		return { valid: false, error: 'URL cannot point to private/internal IP addresses' };
	}

	return { valid: true };
}
