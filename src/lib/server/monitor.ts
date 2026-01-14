import { execSync } from 'child_process';
import { db } from '$lib/server/db';
import { peers, appSettings, peerUsageHourly, peerUsageMonthly } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
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

// Persistence State
// Track the LAST TOTAL seen from WG to calculate Deltas
let lastRawStats = new Map<number, { rx: number, tx: number }>();

// Accumulate Deltas to flush to DB
let pendingUsage = new Map<number, { rx: number, tx: number }>();
let lastFlushTime = Date.now();

// Config
const OFFLINE_THRESHOLD_SEC = 180; // 3 minutes
const FLUSH_INTERVAL_MS = 60000; // 1 minute

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

            // --- Persistence Logic ---
            let deltaRx = 0;
            let deltaTx = 0;

            const prev = lastRawStats.get(peer.id);
            if (prev) {
                // If current total >= previous total, it's a valid increment
                if (rx >= prev.rx) deltaRx = rx - prev.rx;
                // If current total < previous, WG restarted or counters reset. 
                // We treat 'rx' as the delta (assuming it started from 0)
                else deltaRx = rx;

                if (tx >= prev.tx) deltaTx = tx - prev.tx;
                else deltaTx = tx;
            } else {
                // First time seeing this peer in this session.
                // We can't know the delta since we don't know start time.
                // Assume 0 delta to avoid massive spikes on service restart.
                deltaRx = 0;
                deltaTx = 0;
            }

            // Update Last Raw
            lastRawStats.set(peer.id, { rx, tx });

            // Accumulate Pending
            const pending = pendingUsage.get(peer.id) || { rx: 0, tx: 0 };
            pendingUsage.set(peer.id, {
                rx: pending.rx + deltaRx,
                tx: pending.tx + deltaTx
            });
            // --------------------------

            currentStats[peer.id] = { rx, tx, handshake, online: isOnline };

            // Check Status Change
            const lastOnline = lastStatusMap.get(peer.id) ?? false;

            if (lastStatusMap.has(peer.id) && lastOnline !== isOnline) {
                console.log(`Peer ${peer.name} (${peer.id}) changed state: ${lastOnline ? 'Online' : 'Offline'} -> ${isOnline ? 'Online' : 'Offline'}`);
                sendWebhook(peer.name, isOnline);
            }

            lastStatusMap.set(peer.id, isOnline);
        }
    }

    // Flush to DB
    if (now - lastFlushTime > FLUSH_INTERVAL_MS) {
        await flushStats();
        lastFlushTime = now;
    }

    // Emit for SSE
    statsEmitter.emit('stats', currentStats);
}

async function flushStats() {
    if (pendingUsage.size === 0) return;

    console.log(`Flushing stats for ${pendingUsage.size} peers...`);
    const entries = Array.from(pendingUsage.entries());

    // Reset pending immediately so new ticks can accumulate
    pendingUsage.clear();

    const now = new Date();
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime() / 1000;
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const [peerId, stats] of entries) {
        if (stats.rx === 0 && stats.tx === 0) continue;

        try {
            // 1. Initial Insert or Update Hourly
            // Note: SQLite upsert matching on a unique constraint is ideal.
            // But we didn't define unique constraint on (peerId, timestamp) in Drizzle schema explicitly via indexes yet.
            // However, we can construct the query to aggregate manually or use simple insert for now.
            // Let's assume we need to handle duplicates.

            // Check if row exists
            const existingHourly = await db.select().from(peerUsageHourly)
                .where(sql`${peerUsageHourly.peerId} = ${peerId} AND ${peerUsageHourly.timestamp} = ${currentHour}`)
                .limit(1);

            if (existingHourly.length > 0) {
                await db.update(peerUsageHourly)
                    .set({
                        rx: existingHourly[0].rx + stats.rx,
                        tx: existingHourly[0].tx + stats.tx
                    })
                    .where(eq(peerUsageHourly.id, existingHourly[0].id));
            } else {
                await db.insert(peerUsageHourly).values({
                    peerId,
                    timestamp: currentHour,
                    rx: stats.rx,
                    tx: stats.tx
                });
            }

            // 2. Monthly
            const existingMonthly = await db.select().from(peerUsageMonthly)
                .where(sql`${peerUsageMonthly.peerId} = ${peerId} AND ${peerUsageMonthly.month} = ${currentMonth}`)
                .limit(1);

            if (existingMonthly.length > 0) {
                await db.update(peerUsageMonthly)
                    .set({
                        rx: existingMonthly[0].rx + stats.rx,
                        tx: existingMonthly[0].tx + stats.tx
                    })
                    .where(eq(peerUsageMonthly.id, existingMonthly[0].id));
            } else {
                await db.insert(peerUsageMonthly).values({
                    peerId,
                    month: currentMonth,
                    rx: stats.rx,
                    tx: stats.tx
                });
            }

        } catch (e) {
            console.error(`Failed to flush stats for peer ${peerId}:`, e);
        }
    }
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
