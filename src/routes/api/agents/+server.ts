import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { peers, appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';

// GET /api/agents - List all agents
export const GET: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allAgents = await db.select().from(peers);
    return json(allAgents);
};

// POST /api/agents - Create a new pending agent (creates setup token)
export const POST: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await event.request.json();

    if (!body.name) {
        return json({ error: 'Name is required' }, { status: 400 });
    }

    let wgIp = body.wgIp;
    const type = body.type || 'agent';

    if (!wgIp) {
        // Auto-assign IP
        const existingAgents = await db.select({ wgIp: peers.wgIp }).from(peers);
        const usedIps = new Set(existingAgents.map((p) => p.wgIp));

        // Find first available IP in 10.8.0.x range, starting from .2
        for (let i = 2; i < 255; i++) {
            const candidate = `10.8.0.${i}`;
            if (!usedIps.has(candidate)) {
                wgIp = candidate;
                break;
            }
        }

        if (!wgIp) {
            return json({ error: 'No available IPs in 10.8.0.x range' }, { status: 500 });
        }
    } else {
        // Validate provided IP
        const ipRegex = /^10\.8\.\d{1,3}\.\d{1,3}$/;
        if (!ipRegex.test(wgIp)) {
            return json({ error: 'Invalid WireGuard IP. Use 10.8.x.x' }, { status: 400 });
        }
    }

    if (type === 'device') {
        // Generate keys for Device
        let privateKey;
        let publicKey;
        try {
            privateKey = execSync('wg genkey').toString().trim();
            publicKey = execSync(`echo '${privateKey}' | wg pubkey`).toString().trim();
        } catch (e) {
            return json({ error: 'Failed to generate keys. Is wireguard-tools installed?' }, { status: 500 });
        }

        // Get Server Config
        const settings = await db.select().from(appSettings);
        let serverPublicKey = '';
        let serverEndpoint = '';
        for (const s of settings) {
            if (s.key === 'server_public_key') serverPublicKey = s.value;
            if (s.key === 'server_endpoint') serverEndpoint = s.value;
        }

        try {
            await db.insert(peers).values({
                name: body.name,
                wgIp,
                publicKey,
                status: 'active',
                type: 'device'
            });

            return json({
                success: true,
                wgIp,
                privateKey,
                publicKey,
                serverPublicKey,
                serverEndpoint,
                type: 'device'
            });
        } catch (e) {
            // Handle Unique constraint error etc...
            if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
                return json({ error: 'Name or IP already exists' }, { status: 409 });
            }
            return json({ error: 'Failed to create device' }, { status: 500 });
        }
    }

    // AGENT Flow
    // Generate setup token (32 random bytes, hex)
    const setupToken = randomBytes(32).toString('hex');

    try {
        await db.insert(peers).values({
            name: body.name,
            wgIp,
            setupToken,
            status: 'pending',
            type: 'agent'
        });

        return json({ success: true, token: setupToken, wgIp, type: 'agent' });
    } catch (e) {
        if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
            return json({ error: 'Name or IP already exists' }, { status: 409 });
        }
        return json({ error: 'Failed to create agent' }, { status: 500 });
    }
};

// DELETE /api/agents - Remove an agent
export const DELETE: RequestHandler = async (event) => {
    if (!event.locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await event.request.json();
    if (!body.id) {
        return json({ error: 'ID is required' }, { status: 400 });
    }

    try {
        await db.delete(peers).where(eq(peers.id, body.id));
        return json({ success: true });
    } catch (e) {
        return json({ error: 'Failed to delete agent' }, { status: 500 });
    }
};
