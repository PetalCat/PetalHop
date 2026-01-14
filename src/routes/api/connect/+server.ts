import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { peers, forwards, appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { generateRules } from '$lib/server/nft';

// POST /api/connect - Agent self-registration
export const POST: RequestHandler = async (event) => {
    const body = await event.request.json();

    if (!body.token || !body.publicKey) {
        return json({ error: 'Token and publicKey are required' }, { status: 400 });
    }

    // Find pending agent by token
    let [agent] = await db
        .select()
        .from(peers)
        .where(eq(peers.setupToken, body.token))
        .limit(1);

    // Fallback: If not found by token, try to find by publicKey (reconnection)
    if (!agent) {
        [agent] = await db
            .select()
            .from(peers)
            .where(eq(peers.publicKey, body.publicKey))
            .limit(1);
    }

    if (!agent) {
        return json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    if (agent.status === 'active') {
        // If already active, check if key matches (re-connect)
        if (agent.publicKey !== body.publicKey) {
            return json({ error: 'Agent already active with different key' }, { status: 409 });
        }
    } else {
        // Activate agent
        await db
            .update(peers)
            .set({
                publicKey: body.publicKey,
                status: 'active',
                setupToken: null // One-time use: clear (or keep null to verify "consumed")
                // Actually, we might want to keep it null or generate a new "api key" if needed.
                // For now, let's just mark active and store key.
                // Clearing token prevents reuse by others.
            })
            .where(eq(peers.id, agent.id));
    }

    // Get forwards for this agent
    const agentForwards = await db
        .select()
        .from(forwards)
        .where(eq(forwards.peerId, agent.id));

    // Get Server Config (Public Key and Endpoint)
    const settings = await db.select().from(appSettings);
    let serverPublicKey = '';
    let serverEndpoint = '';

    for (const s of settings) {
        if (s.key === 'server_public_key') serverPublicKey = s.value;
        if (s.key === 'server_endpoint') serverEndpoint = s.value;
    }

    // Return config
    console.log('Connect hit for agent:', agent.id);
    return json({
        success: true,
        agent_id: String(agent.id),
        wgIp: agent.wgIp,
        // In a real scenario, we might return the server's public key here too if stored in settings
        serverPublicKey,
        serverEndpoint,
        forwards: agentForwards.map(f => ({
            protocol: f.protocol,
            port: f.publicPort,
            targetPort: f.privatePort
        }))
    });
};
