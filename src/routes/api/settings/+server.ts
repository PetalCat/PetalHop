import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/settings - Update app settings (admin only)
export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!event.locals.user.isAdmin) {
        return json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await event.request.json();

    // Update signups_enabled
    if (typeof body.signupsEnabled === 'boolean') {
        await db
            .insert(appSettings)
            .values({ key: 'signups_enabled', value: String(body.signupsEnabled) })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: String(body.signupsEnabled) }
            });
    }

    // Update mfa_required
    if (typeof body.mfaRequired === 'boolean') {
        await db
            .insert(appSettings)
            .values({ key: 'mfa_required', value: String(body.mfaRequired) })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: String(body.mfaRequired) }
            });
    }

    // Update controller_url
    if (typeof body.controllerUrl === 'string') {
        await db
            .insert(appSettings)
            .values({ key: 'controller_url', value: body.controllerUrl })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: body.controllerUrl }
            });
    }

    // Update server_public_key
    if (typeof body.serverPublicKey === 'string') {
        await db
            .insert(appSettings)
            .values({ key: 'server_public_key', value: body.serverPublicKey })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: body.serverPublicKey }
            });
    }

    // Update server_endpoint
    if (typeof body.serverEndpoint === 'string') {
        await db
            .insert(appSettings)
            .values({ key: 'server_endpoint', value: body.serverEndpoint })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: body.serverEndpoint }
            });
    }

    return json({ success: true });
};
