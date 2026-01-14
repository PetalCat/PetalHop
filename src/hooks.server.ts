import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';
import { checkRateLimit, RATE_LIMITS } from '$lib/server/rateLimit';
import { env } from '$env/dynamic/private';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/signup', '/api/connect', '/setup'];

// Maximum request body size (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// Check if running in production
function isProduction(): boolean {
    return env.NODE_ENV === 'production';
}

// Routes that need strict rate limiting
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/signup', '/api/auth/mfa/verify'];
const CONNECT_ROUTES = ['/api/connect'];

import { building } from '$app/environment';
import { applyRules } from '$lib/server/nft';

import { startMonitoring } from '$lib/server/monitor';

if (!building) {
    applyRules().catch(e => console.error('Startup Rule Application Failed:', e));
    startMonitoring();
}

export const handle: Handle = async ({ event, resolve }) => {
    // Check request body size to prevent DoS
    const contentLength = event.request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return new Response(JSON.stringify({ error: 'Request body too large' }), {
            status: 413,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Get client IP for rate limiting
    const clientIp = event.getClientAddress();

    // Apply rate limiting for sensitive endpoints
    if (AUTH_ROUTES.some(route => event.url.pathname.startsWith(route))) {
        const result = checkRateLimit(`auth:${clientIp}`, RATE_LIMITS.auth);
        if (result.limited) {
            return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000))
                }
            });
        }
    } else if (CONNECT_ROUTES.some(route => event.url.pathname.startsWith(route))) {
        const result = checkRateLimit(`connect:${clientIp}`, RATE_LIMITS.connect);
        if (result.limited) {
            return new Response(JSON.stringify({ error: 'Too many connection attempts. Please try again later.' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000))
                }
            });
        }
    } else if (event.url.pathname.startsWith('/api/')) {
        const result = checkRateLimit(`api:${clientIp}`, RATE_LIMITS.api);
        if (result.limited) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000))
                }
            });
        }
    }

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

    const response = await resolve(event);

    // Add security headers to all responses
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // HSTS - only in production with HTTPS (1 year, include subdomains, preload)
    if (isProduction()) {
        response.headers.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    // Content Security Policy - adjust as needed for your app
    if (!event.url.pathname.startsWith('/api/')) {
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';"
        );
    }

    return response;
};
