import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';
import fs from 'fs';

// POST /api/settings/detect-key - Try to auto-detect server public key
export const POST: RequestHandler = async (event) => {
    if (!event.locals.user?.isAdmin) {
        return json({ error: 'Unauthorized' }, { status: 403 });
    }

    let publicKey = '';

    // Strategy 1: wg command (requires sudo usually, or user permissions)
    try {
        // We can try to read specific file if we know where it is, e.g. /etc/wireguard/public.key
        if (fs.existsSync('/etc/wireguard/public.key')) {
            publicKey = fs.readFileSync('/etc/wireguard/public.key', 'utf8').trim();
        } else if (fs.existsSync('/etc/wireguard/wg0.conf')) {
            // Maybe parse? Hard to parse private key to public key without wg tool
        }

        if (!publicKey) {
            // Try command
            publicKey = execSync('wg show wg0 public-key', { encoding: 'utf8' }).trim();
        }
    } catch (e) {
        console.error('Auto-detect key failed:', e);
        return json({ error: 'Could not detect public key. Ensure WireGuard is running or /etc/wireguard/public.key exists.' }, { status: 500 });
    }

    if (publicKey) {
        return json({ publicKey });
    }

    return json({ error: 'Public key not found' }, { status: 404 });
};
