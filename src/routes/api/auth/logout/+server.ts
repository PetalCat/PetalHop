import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
    if (!event.locals.session) {
        return json({ error: 'Not authenticated' }, { status: 401 });
    }

    await invalidateSession(event.locals.session.id);
    deleteSessionTokenCookie(event);

    return json({ success: true });
};
