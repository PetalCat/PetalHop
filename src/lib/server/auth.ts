import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Session expiry: 30 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionValidationResult =
    | { session: typeof sessions.$inferSelect; user: typeof users.$inferSelect }
    | { session: null; user: null };

/**
 * Generate a new session token (32 random bytes, base32 encoded)
 */
export function generateSessionToken(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return encodeBase32LowerCaseNoPadding(bytes);
}

/**
 * Create a new session for a user
 */
export async function createSession(
    token: string,
    userId: string,
    mfaVerified: boolean = false
): Promise<typeof sessions.$inferSelect> {
    const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    const [session] = await db
        .insert(sessions)
        .values({
            id: sessionId,
            userId,
            expiresAt,
            mfaVerified
        })
        .returning();

    return session;
}

/**
 * Validate a session token and return the session + user if valid
 */
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
    const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

    const result = await db
        .select({
            session: sessions,
            user: users
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.id, sessionId))
        .limit(1);

    if (result.length === 0) {
        return { session: null, user: null };
    }

    const { session, user } = result[0];

    // Check if session has expired
    if (Date.now() >= session.expiresAt.getTime()) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        return { session: null, user: null };
    }

    // Extend session if it's more than halfway through its lifetime
    if (Date.now() >= session.expiresAt.getTime() - SESSION_EXPIRY_MS / 2) {
        const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
        await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, sessionId));
        session.expiresAt = newExpiresAt;
    }

    return { session, user };
}

/**
 * Invalidate a session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Update session MFA verified status
 */
export async function setSessionMfaVerified(sessionId: string): Promise<void> {
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, sessionId));
}

/**
 * Determine if we should use secure cookies (HTTPS only)
 * In production, always use secure cookies
 */
function isSecureCookie(): boolean {
    // Check if running in production or if explicitly set
    const nodeEnv = env.NODE_ENV || 'development';
    const forceSecure = env.SECURE_COOKIES === 'true';
    return nodeEnv === 'production' || forceSecure;
}

/**
 * Set session cookie
 */
export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
    event.cookies.set('session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureCookie(),
        expires: expiresAt,
        path: '/'
    });
}

/**
 * Delete session cookie
 */
export function deleteSessionTokenCookie(event: RequestEvent): void {
    event.cookies.set('session', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureCookie(),
        maxAge: 0,
        path: '/'
    });
}
