import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyTotpCode } from '$lib/server/password';
import { setSessionMfaVerified } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user || !event.locals.session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await event.request.json();

    if (!body.code || !/^\d{6}$/.test(body.code)) {
        return json({ error: 'Invalid code format. Enter 6 digits.' }, { status: 400 });
    }

    const user = event.locals.user;

    if (!user.mfaSecret) {
        return json({ error: 'MFA not set up' }, { status: 400 });
    }

    // Verify the TOTP code
    const isValid = verifyTotpCode(user.mfaSecret, body.code);

    if (!isValid) {
        return json({ error: 'Invalid verification code' }, { status: 401 });
    }

    // If MFA wasn't enabled yet, enable it now (first-time setup verification)
    if (!user.mfaEnabled) {
        await db
            .update(users)
            .set({ mfaEnabled: true })
            .where(eq(users.id, user.id));
    }

    // Mark session as MFA verified
    await setSessionMfaVerified(event.locals.session.id);

    return json({
        success: true,
        message: user.mfaEnabled ? 'MFA verified' : 'MFA enabled successfully'
    });
};
