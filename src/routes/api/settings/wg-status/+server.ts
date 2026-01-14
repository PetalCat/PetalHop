import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';

// GET /api/settings/wg-status - Check status of WireGuard interface
export const GET: RequestHandler = async (event) => {
    if (!event.locals.user?.isAdmin) {
        return json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        // Check if wg0 interface exists and is up
        // "ip link show wg0" returns exit code 0 if exists, 1 if not
        try {
            execSync('ip link show wg0', { stdio: 'ignore' });
        } catch {
            return json({ status: 'down', message: 'Interface wg0 not found' });
        }

        // Check if it's actually UP (running)
        const output = execSync('ip link show wg0', { encoding: 'utf8' });
        const isUp = output.includes('state UP') || output.includes('state UNKNOWN'); // WireGuard often shows UNKNOWN state but is working

        // Also try to get peer count
        let peerCount = 0;
        try {
            const wgOutput = execSync('wg show wg0 peers', { encoding: 'utf8' });
            peerCount = wgOutput.trim().split('\n').filter(Boolean).length;
        } catch { }

        return json({
            status: isUp ? 'up' : 'down',
            peerCount
        });
    } catch (e) {
        console.error('WG Status check failed:', e);
        return json({ status: 'error', message: 'Failed to check status' });
    }
};
