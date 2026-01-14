import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/server/password';
import {
    createSession,
    generateSessionToken,
    setSessionTokenCookie
} from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
    const body = await event.request.json();

    if (!body.email || !body.password) {
        return json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Find user by email
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email.toLowerCase().trim()))
        .limit(1);

    if (!user) {
        return json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
        return json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Create session
    const token = generateSessionToken();
    const session = await createSession(token, user.id, !user.mfaEnabled);
    setSessionTokenCookie(event, token, session.expiresAt);

    // Check if MFA is required
    if (user.mfaEnabled) {
        return json({
            success: true,
            mfaRequired: true,
            message: 'Please enter your MFA code'
        });
    }

    return json({
        success: true,
        mfaRequired: false,
        user: {
            id: user.id,
            email: user.email,
            isAdmin: user.isAdmin
        }
    });
};
