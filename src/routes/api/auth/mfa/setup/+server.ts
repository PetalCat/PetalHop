import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateTotpSecret, generateTotpUri } from '$lib/server/password';
import QRCode from 'qrcode';

// POST /api/auth/mfa/setup - Generate new TOTP secret
export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate new TOTP secret
    const secret = generateTotpSecret();

    // Store secret but don't enable MFA yet (user must verify first)
    await db
        .update(users)
        .set({ mfaSecret: secret, mfaEnabled: false })
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
        message: 'Scan the QR code with your authenticator app, then verify with a code'
    });
};

// DELETE /api/auth/mfa/setup - Disable MFA
export const DELETE: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db
        .update(users)
        .set({ mfaSecret: null, mfaEnabled: false })
        .where(eq(users.id, event.locals.user.id));

    return json({ success: true, message: 'MFA disabled' });
};
