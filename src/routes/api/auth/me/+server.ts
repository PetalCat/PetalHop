import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';

// GET /api/auth/me - Get current user and settings
export const GET: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get app settings if admin
    let signupsEnabled = true;
    let mfaRequired = false;
    let controllerUrl = '';
    let serverPublicKey = '';
    let serverEndpoint = '';

    if (event.locals.user.isAdmin) {
        const settings = await db.select().from(appSettings);
        for (const setting of settings) {
            if (setting.key === 'signups_enabled') {
                signupsEnabled = setting.value === 'true';
            } else if (setting.key === 'mfa_required') {
                mfaRequired = setting.value === 'true';
            } else if (setting.key === 'controller_url') {
                controllerUrl = setting.value;
            } else if (setting.key === 'server_public_key') {
                serverPublicKey = setting.value;
            } else if (setting.key === 'server_endpoint') {
                serverEndpoint = setting.value;
            }
        }

        // Fallback to ORIGIN env var if controllerUrl is not set in DB
        if (!controllerUrl && env.ORIGIN) {
            controllerUrl = env.ORIGIN;
        }

        // Fallback to SERVER_ENDPOINT env var if serverEndpoint is not set in DB
        // Use generic access to avoid type issues if SERVER_ENDPOINT isn't in standard types yet
        const defaultEndpoint = (env as any).SERVER_ENDPOINT;
        if (!serverEndpoint && defaultEndpoint) {
            serverEndpoint = defaultEndpoint;
        }
    }

    return json({
        user: {
            id: event.locals.user.id,
            email: event.locals.user.email,
            isAdmin: event.locals.user.isAdmin,
            mfaEnabled: event.locals.user.mfaEnabled
        },
        signupsEnabled,
        mfaRequired,
        controllerUrl,
        serverPublicKey,
        serverEndpoint
    });
};
