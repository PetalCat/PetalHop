import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateRules } from '$lib/server/nft';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RULES_PATH = '/etc/wg-ingress/rules.nft';

// POST /api/apply - Generate and apply nftables rules
export const POST: RequestHandler = async () => {
    try {
        const rules = await generateRules();

        // Ensure directory exists
        await mkdir('/etc/wg-ingress', { recursive: true }).catch(() => {
            // Ignore if it fails (might need sudo)
        });

        // Write rules file
        await writeFile(RULES_PATH, rules);

        // Apply rules using nft
        await execFileAsync('/usr/sbin/nft', ['-f', RULES_PATH]);

        return json({
            applied: true,
            message: 'Rules applied successfully',
            rulesPath: RULES_PATH
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Return the generated rules for debugging even if apply failed
        let rules: string | undefined;
        try {
            rules = await generateRules();
        } catch {
            // Ignore
        }

        return json(
            {
                applied: false,
                error: errorMessage,
                rules // Include generated rules for debugging
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
