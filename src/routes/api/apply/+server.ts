import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyRules } from '$lib/server/nft';
const RULES_PATH = '/etc/wg-ingress/rules.nft';

// POST /api/apply - Generate and apply nftables rules
export const POST: RequestHandler = async () => {
    try {
        await applyRules();

        return json({
            applied: true,
            message: 'Rules applied successfully'
        });
    } catch (error) {
        return json(
            {
                applied: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
};

// GET /api/apply - Preview rules without applying
export const GET: RequestHandler = async () => {
    const rules = await generateRules();
    return json({ rules });
};
