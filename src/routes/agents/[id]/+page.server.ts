import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { peers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
    if (!locals.user) {
        error(401, 'Unauthorized');
    }

    const peerId = parseInt(params.id);
    if (isNaN(peerId)) {
        error(400, 'Invalid Peer ID');
    }

    const peer = await db.query.peers.findFirst({
        where: eq(peers.id, peerId)
    });

    if (!peer) {
        error(404, 'Agent not found');
    }

    return {
        peer
    };
};
