import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/signup', '/api/connect', '/setup', '/api/agent-source'];

import { building } from '$app/environment';
import { applyRules } from '$lib/server/nft';

import { startMonitoring } from '$lib/server/monitor';

if (!building) {
    applyRules().catch(e => console.error('Startup Rule Application Failed:', e));
    startMonitoring();
}

export const handle: Handle = async ({ event, resolve }) => {
    // Get session token from cookie
    const token = event.cookies.get('session');

    if (token) {
        const { session, user } = await validateSessionToken(token);
        event.locals.session = session;
        event.locals.user = user;
    } else {
        event.locals.session = null;
        event.locals.user = null;
    }

    // Check if route requires authentication
    const isPublicRoute = PUBLIC_ROUTES.some(
        (route) => event.url.pathname === route || event.url.pathname.startsWith(route + '/')
    );

    if (!isPublicRoute && !event.locals.user) {
        // Redirect to login if not authenticated
        if (event.url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(null, {
            status: 302,
            headers: { Location: '/login' }
        });
    }

    // Check MFA requirement for authenticated users
    if (event.locals.user && event.locals.session) {
        const needsMfa =
            event.locals.user.mfaEnabled && !event.locals.session.mfaVerified;
        const isMfaRoute = event.url.pathname === '/login/mfa' || event.url.pathname === '/api/auth/mfa/verify';

        if (needsMfa && !isMfaRoute && !event.url.pathname.startsWith('/api/auth/logout')) {
            if (event.url.pathname.startsWith('/api/')) {
                return new Response(JSON.stringify({ error: 'MFA required' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response(null, {
                status: 302,
                headers: { Location: '/login/mfa' }
            });
        }
    }

    return resolve(event);
};
