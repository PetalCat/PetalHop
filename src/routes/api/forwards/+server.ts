import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { forwards, peers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/forwards - List all forwards with peer info
export const GET: RequestHandler = async () => {
    const allForwards = await db
        .select({
            id: forwards.id,
            peerId: forwards.peerId,
            protocol: forwards.protocol,
            publicPort: forwards.publicPort,
            privatePort: forwards.privatePort,
            peerName: peers.name,
            wgIp: peers.wgIp
        })
        .from(forwards)
        .innerJoin(peers, eq(forwards.peerId, peers.id));

    return json(allForwards);
};

// POST /api/forwards - Create a new forward rule
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();

    if (!body.peerId || !body.protocol || !body.publicPort || !body.privatePort) {
        return json(
            { error: 'peerId, protocol, publicPort, and privatePort are required' },
            { status: 400 }
        );
    }

    if (!['tcp', 'udp'].includes(body.protocol)) {
        return json({ error: 'protocol must be tcp or udp' }, { status: 400 });
    }

    try {
        const [newForward] = await db
            .insert(forwards)
            .values({
                peerId: body.peerId,
                protocol: body.protocol,
                publicPort: body.publicPort,
                privatePort: body.privatePort
            })
            .returning();

        return json(newForward, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
            return json(
                { error: 'A forward with this protocol and public port already exists' },
                { status: 409 }
            );
        }
        if (error instanceof Error && error.message.includes('FOREIGN KEY')) {
            return json({ error: 'Peer not found' }, { status: 404 });
        }
        throw error;
    }
};

// DELETE /api/forwards - Delete a forward by ID
export const DELETE: RequestHandler = async ({ request }) => {
    const body = await request.json();

    if (!body.id) {
        return json({ error: 'id is required' }, { status: 400 });
    }

    await db.delete(forwards).where(eq(forwards.id, body.id));
    return json({ ok: true });
};
