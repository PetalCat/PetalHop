import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { peers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/peers - List all peers
export const GET: RequestHandler = async () => {
    const allPeers = await db.select().from(peers);
    return json(allPeers);
};

// POST /api/peers - Create a new peer
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();

    if (!body.name || !body.wgIp) {
        return json({ error: 'name and wgIp are required' }, { status: 400 });
    }

    try {
        const [newPeer] = await db
            .insert(peers)
            .values({
                name: body.name,
                wgIp: body.wgIp
            })
            .returning();

        return json(newPeer, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
            return json({ error: 'Peer with this IP already exists' }, { status: 409 });
        }
        throw error;
    }
};

// DELETE /api/peers - Delete a peer by ID
export const DELETE: RequestHandler = async ({ request }) => {
    const body = await request.json();

    if (!body.id) {
        return json({ error: 'id is required' }, { status: 400 });
    }

    await db.delete(peers).where(eq(peers.id, body.id));
    return json({ ok: true });
};
