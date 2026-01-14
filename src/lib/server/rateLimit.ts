interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore) {
		if (entry.resetAt < now) {
			rateLimitStore.delete(key);
		}
	}
}, 60000); // Clean up every minute

/**
 * Check if a request should be rate limited
 * @param key Unique identifier (e.g., IP + endpoint)
 * @param config Rate limit configuration
 * @returns Object with limited status and remaining requests
 */
export function checkRateLimit(
	key: string,
	config: RateLimitConfig
): { limited: boolean; remaining: number; resetAt: number } {
	const now = Date.now();
	const entry = rateLimitStore.get(key);

	if (!entry || entry.resetAt < now) {
		// Create new entry
		const newEntry: RateLimitEntry = {
			count: 1,
			resetAt: now + config.windowMs
		};
		rateLimitStore.set(key, newEntry);
		return { limited: false, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt };
	}

	// Increment existing entry
	entry.count++;

	if (entry.count > config.maxRequests) {
		return { limited: true, remaining: 0, resetAt: entry.resetAt };
	}

	return { limited: false, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

// Predefined rate limit configs for different endpoints
export const RATE_LIMITS = {
	// Strict limit for auth endpoints to prevent brute force
	auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 }, // 10 requests per 15 minutes
	// Standard API limit
	api: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
	// Agent connection limit
	connect: { windowMs: 60 * 1000, maxRequests: 5 } // 5 requests per minute
} as const;
