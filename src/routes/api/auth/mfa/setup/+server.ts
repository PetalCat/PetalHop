import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateTotpSecret, generateTotpUri } from '$lib/server/password';
import { generateBackupCodes } from '$lib/server/mfaBackup';
import QRCode from 'qrcode';

// POST /api/auth/mfa/setup - Generate new TOTP secret
export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate new TOTP secret and backup codes
    const secret = generateTotpSecret();
    const { plainCodes, hashedCodes } = generateBackupCodes();

    // Store secret and backup codes, but don't enable MFA yet (user must verify first)
    await db
        .update(users)
        .set({
            mfaSecret: secret,
            mfaBackupCodes: JSON.stringify(hashedCodes),
            mfaEnabled: false
        })
        .where(eq(users.id, event.locals.user.id));

    // Generate the TOTP URI for QR code
    const uri = generateTotpUri(secret, event.locals.user.email);

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });

    return json({
        secret,
        uri,
        qrCode,
        backupCodes: plainCodes,
        message: 'Scan the QR code with your authenticator app, then verify with a code. Save your backup codes securely - they will only be shown once!'
    });
};

// DELETE /api/auth/mfa/setup - Disable MFA
export const DELETE: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db
        .update(users)
        .set({ mfaSecret: null, mfaBackupCodes: null, mfaEnabled: false })
        .where(eq(users.id, event.locals.user.id));

    return json({ success: true, message: 'MFA disabled' });
};
