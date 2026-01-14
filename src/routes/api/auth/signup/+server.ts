import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, appSettings } from '$lib/server/db/schema';
import { eq, count } from 'drizzle-orm';
import { hashPassword } from '$lib/server/password';
import {
    createSession,
    generateSessionToken,
    setSessionTokenCookie
} from '$lib/server/auth';
import { validatePasswordStrength } from '$lib/server/passwordPolicy';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async (event) => {
    const body = await event.request.json();

    if (!body.email || !body.password) {
        return json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
        return json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate password strength with comprehensive policy
    const passwordValidation = validatePasswordStrength(body.password);
    if (!passwordValidation.valid) {
        return json({
            error: 'Password does not meet requirements',
            details: passwordValidation.errors
        }, { status: 400 });
    }

    // Check if this is the first user (will be admin)
    const [userCount] = await db.select({ count: count() }).from(users);
    const isFirstUser = userCount.count === 0;

    // If first user, require INIT_TOKEN for security
    // This prevents attackers from racing to create the admin account
    if (isFirstUser) {
        const initToken = env.INIT_TOKEN;
        if (initToken && initToken.length > 0) {
            // INIT_TOKEN is set, require it for first signup
            if (body.initToken !== initToken) {
                return json({
                    error: 'Initial setup token required for first user registration',
                    requiresInitToken: true
                }, { status: 403 });
            }
        }
        // If INIT_TOKEN is not set, allow first signup (dev mode)
    }

    // If not first user, check if signups are enabled
    if (!isFirstUser) {
        const [signupSetting] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, 'signups_enabled'))
            .limit(1);

        if (signupSetting && signupSetting.value === 'false') {
            return json({ error: 'Signups are currently disabled' }, { status: 403 });
        }
    }

    // Check if email already exists
    const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email.toLowerCase().trim()))
        .limit(1);

    if (existingUser) {
        return json({ error: 'Email already registered' }, { status: 409 });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(body.password);
    const [newUser] = await db
        .insert(users)
        .values({
            email: body.email.toLowerCase().trim(),
            passwordHash,
            isAdmin: isFirstUser
        })
        .returning();

    // If first user, set up default settings
    if (isFirstUser) {
        await db.insert(appSettings).values([
            { key: 'signups_enabled', value: 'true' },
            { key: 'mfa_required', value: 'false' }
        ]).onConflictDoNothing();
    }

    // Create session and log user in
    const token = generateSessionToken();
    const session = await createSession(token, newUser.id, true);
    setSessionTokenCookie(event, token, session.expiresAt);

    return json({
        success: true,
        user: {
            id: newUser.id,
            email: newUser.email,
            isAdmin: newUser.isAdmin
        },
        isFirstUser
    }, { status: 201 });
};
