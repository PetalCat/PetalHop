import { execSync } from 'child_process';
import { db } from '$lib/server/db';
import { peers, appSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'events';

// Types
export interface PeerStats {
    rx: number;
    tx: number;
    handshake: number; // epoch seconds
    online: boolean;
}

export const statsEmitter = new EventEmitter();
let monitorInterval: NodeJS.Timeout | null = null;

// State
let peerMap = new Map<string, { id: number, name: string }>(); // PublicKey -> { ID, Name }
let lastStatusMap = new Map<number, boolean>(); // ID -> online/offline
let webhookUrl: string | null = null;
let lastConfigUpdate = 0;

// Config
const OFFLINE_THRESHOLD_SEC = 180; // 3 minutes

export function startMonitoring() {
    if (monitorInterval) return; // Already running

    console.log('Starting WireGuard Monitor...');

    // Initial config load
    refreshConfig().catch(console.error);

    monitorInterval = setInterval(async () => {
        try {
            await tick();
        } catch (e) {
            console.error('Monitor tick failed:', e);
        }
    }, 1000);
}

async function refreshConfig() {
    // 1. Refresh Peers
    const allPeers = await db.select().from(peers);
    peerMap.clear();
    for (const p of allPeers) {
        if (p.publicKey) peerMap.set(p.publicKey, { id: p.id, name: p.name });
    }

    // 2. Refresh Settings (Webhook)
    const settings = await db.select().from(appSettings);
    const urlSetting = settings.find(s => s.key === 'matrix_webhook_url');
    webhookUrl = urlSetting ? urlSetting.value : null;

    lastConfigUpdate = Date.now();
}

async function tick() {
    const now = Date.now();
    if (now - lastConfigUpdate > 60000) {
        await refreshConfig();
    }

    // 1. Fetch Stats
    let output = '';
    try {
        output = execSync('wg show wg0 dump', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        // Interface down?
        return;
    }

    const currentStats: Record<number, PeerStats> = {};
    const lines = output.trim().split('\n');
    const nowSec = Math.floor(now / 1000);

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 8) continue;

        const pubKey = parts[0];
        const handshake = parseInt(parts[4]);
        const rx = parseInt(parts[5]);
        const tx = parseInt(parts[6]);

        const peer = peerMap.get(pubKey);
        if (peer) {
            const timeSinceHandshake = nowSec - handshake;
            const isOnline = timeSinceHandshake < OFFLINE_THRESHOLD_SEC;

            currentStats[peer.id] = { rx, tx, handshake, online: isOnline };

            // Check Status Change
            const lastOnline = lastStatusMap.get(peer.id) ?? false;

            // Logic: Only trigger if state truly changed. 
            // Note: Handshake time only updates when handshake occurs. 
            // If handshake is old, it stays old. isOnline becomes false.

            // To prevent "flapping" on startup, we might want to seed lastStatusMap first?
            // Or just assume offline at start? 
            // Let's rely on map having key.

            if (lastStatusMap.has(peer.id) && lastOnline !== isOnline) {
                console.log(`Peer ${peer.name} (${peer.id}) changed state: ${lastOnline ? 'Online' : 'Offline'} -> ${isOnline ? 'Online' : 'Offline'}`);
                sendWebhook(peer.name, isOnline);
            }

            lastStatusMap.set(peer.id, isOnline);
        }
    }

    // Emit for SSE
    statsEmitter.emit('stats', currentStats);
}

async function sendWebhook(peerName: string, isOnline: boolean) {
    if (!webhookUrl) return;

    const emoji = isOnline ? '🟢' : '🔴';
    const msg = `${emoji} **${peerName}** is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`;

    // Matrix format looks for "body" and "msgtype"
    const payload = {
        msgtype: 'm.text',
        body: msg,
        format: 'org.matrix.custom.html',
        formatted_body: `<h3>${emoji} ${peerName}</h3><p>Status: <b>${isOnline ? 'ONLINE' : 'OFFLINE'}</b></p>`
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('Failed to send webhook:', e);
    }
}
