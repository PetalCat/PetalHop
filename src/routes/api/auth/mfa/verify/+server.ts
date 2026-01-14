import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyTotpCode } from '$lib/server/password';
import { setSessionMfaVerified } from '$lib/server/auth';
import { verifyBackupCode, removeBackupCode } from '$lib/server/mfaBackup';

export const POST: RequestHandler = async (event) => {
    if (!event.locals.user || !event.locals.session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await event.request.json();
    const code = body.code?.toString().trim();

    if (!code) {
        return json({ error: 'Code is required' }, { status: 400 });
    }

    const user = event.locals.user;

    if (!user.mfaSecret) {
        return json({ error: 'MFA not set up' }, { status: 400 });
    }

    // Check if it's a TOTP code (6 digits) or backup code (8 alphanumeric)
    const isTotpCode = /^\d{6}$/.test(code);
    const isBackupCode = /^[A-Z0-9]{8}$/i.test(code);

    if (!isTotpCode && !isBackupCode) {
        return json({ error: 'Invalid code format. Enter 6-digit TOTP code or 8-character backup code.' }, { status: 400 });
    }

    let isValid = false;
    let usedBackupCode = false;

    if (isTotpCode) {
        // Verify the TOTP code
        isValid = verifyTotpCode(user.mfaSecret, code);
    } else if (isBackupCode && user.mfaBackupCodes) {
        // Verify backup code
        const hashedCodes: string[] = JSON.parse(user.mfaBackupCodes);
        const codeIndex = verifyBackupCode(code, hashedCodes);

        if (codeIndex >= 0) {
            isValid = true;
            usedBackupCode = true;

            // Remove the used backup code
            const remainingCodes = removeBackupCode(hashedCodes, codeIndex);
            await db
                .update(users)
                .set({ mfaBackupCodes: JSON.stringify(remainingCodes) })
                .where(eq(users.id, user.id));
        }
    }

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

    // Get remaining backup codes count
    const remainingBackupCodes = user.mfaBackupCodes
        ? JSON.parse(user.mfaBackupCodes).length - (usedBackupCode ? 1 : 0)
        : 0;

    return json({
        success: true,
        message: user.mfaEnabled ? 'MFA verified' : 'MFA enabled successfully',
        usedBackupCode,
        remainingBackupCodes
    });
};
