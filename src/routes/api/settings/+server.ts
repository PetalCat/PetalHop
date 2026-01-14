import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '$lib/server/crypto';
import { validateWebhookUrl } from '$lib/server/urlValidation';

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

    // Update matrix_webhook_url (encrypted at rest, with SSRF validation)
    if (typeof body.matrixWebhookUrl === 'string') {
        // Validate webhook URL to prevent SSRF attacks
        const validation = await validateWebhookUrl(body.matrixWebhookUrl);
        if (!validation.valid) {
            return json({ error: validation.error }, { status: 400 });
        }

        // Encrypt the webhook URL before storing
        const encryptedUrl = body.matrixWebhookUrl ? encrypt(body.matrixWebhookUrl) : '';
        await db
            .insert(appSettings)
            .values({ key: 'matrix_webhook_url', value: encryptedUrl })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: { value: encryptedUrl }
            });
    }

    return json({ success: true });
};
