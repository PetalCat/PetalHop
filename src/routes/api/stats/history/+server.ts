import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { peerUsageHourly, peerUsageMonthly } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET /api/stats/history?peerId=123
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const peerIdParam = url.searchParams.get('peerId');
    if (!peerIdParam) {
        return json({ error: 'Missing peerId' }, { status: 400 });
    }

    const peerId = parseInt(peerIdParam);

    try {
        // Fetch last 24 hours
        // Note: In real prod, might want to limit range better
        const hourly = await db.select()
            .from(peerUsageHourly)
            .where(eq(peerUsageHourly.peerId, peerId))
            .orderBy(desc(peerUsageHourly.timestamp))
            .limit(24);

        // Fetch last 12 months
        // Note: Drizzle select returns array
        const monthly = await db.select()
            .from(peerUsageMonthly)
            .where(eq(peerUsageMonthly.peerId, peerId))
            .orderBy(desc(peerUsageMonthly.month))
            .limit(12);

        return json({
            hourly: hourly.reverse(), // Send chronological
            monthly: monthly.reverse()
        });

    } catch (e) {
        console.error('Failed to fetch stats history:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
