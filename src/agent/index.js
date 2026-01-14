import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';

// Configuration
const TOKEN = process.env.TOKEN;
const CONTROLLER_URL = process.env.CONTROLLER_URL; // e.g. https://petalhops.example.com
const WG_CONF_PATH = '/etc/wireguard/wg0.conf';
const PRIVATE_KEY_PATH = '/etc/wireguard/private.key';

if (!TOKEN || !CONTROLLER_URL) {
    console.error('Missing TOKEN or CONTROLLER_URL environment variables');
    process.exit(1);
}

// Helper to run shell commands
function run(/** @type {string} */ cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8' }).trim();
    } catch (/** @type {any} */ e) {
        console.error(`Command failed: ${cmd}`, e.message);
        throw e;
    }
}

async function main() {
    console.log('🌸 PetalHop Agent Starting...');

    // 1. Ensure WireGuard Keys
    if (!fs.existsSync('/etc/wireguard')) {
        fs.mkdirSync('/etc/wireguard', { recursive: true });
    }

    let privateKey;
    if (fs.existsSync(PRIVATE_KEY_PATH)) {
        console.log('Loading existing private key...');
        privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim();
    } else {
        console.log('Generating new WireGuard keys...');
        privateKey = run('wg genkey');
        fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
    }

    const publicKey = run(`echo '${privateKey}' | wg pubkey`);
    console.log(`Agent Public Key: ${publicKey}`);

    // 2. Register/Connect to Controller
    console.log(`Connecting to controller at ${CONTROLLER_URL}...`);

    let config;
    try {
        const res = await fetch(`${CONTROLLER_URL}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: TOKEN, publicKey })
        });

        if (!res.ok) {
            throw new Error(`API Error ${res.status}: ${await res.text()}`);
        }

        config = await res.json();
    } catch (e) {
        console.error('Failed to connect to controller:', e);
        // TODO: Retry logic?
        process.exit(1);
    }

    if (!config.success) {
        console.error('Registration failed:', config.error);
        process.exit(1);
    }

    console.log(`Registered! Assigned IP: ${config.wgIp}`);

    if (!config.serverPublicKey || !config.serverEndpoint) {
        console.warn('⚠️ Server configuration (Receiver Public Key or Endpoint) is missing from controller response.');
        console.warn('Please configure these in the PetalHop Settings page.');
    }

    // 3. Generate wg0.conf
    const wgConf = `[Interface]
PrivateKey = ${privateKey}
Address = ${config.wgIp}/24
# The agent doesn't usually need to listen on a specific port, but we can set one if needed
# ListenPort = 51820 

[Peer]
PublicKey = ${config.serverPublicKey}
AllowedIPs = 10.8.0.1/32
Endpoint = ${config.serverEndpoint}
PersistentKeepalive = 25
`;

    console.log('Writing WireGuard configuration...');
    fs.writeFileSync(WG_CONF_PATH, wgConf, { mode: 0o600 });

    // 4. Start WireGuard
    console.log('Starting WireGuard interface...');
    try {
        // Stop if already running (ignore error)
        try { run('wg-quick down wg0'); } catch (e) { }

        run('wg-quick up wg0');
        console.log('WireGuard is UP 🚀');
    } catch (e) {
        console.error('Failed to start WireGuard:', e);
        process.exit(1);
    }

    // 5. Control Loop / Heartbeat
    console.log('进入 Control Loop (Heartbeats not implemented yet, just keeping alive)');

    // Handle cleanup
    const cleanup = () => {
        console.log('Shutting down...');
        try { run('wg-quick down wg0'); } catch (e) { }
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    setInterval(() => {
        // Future: Send heartbeat / stats to controller
    }, 60000);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
