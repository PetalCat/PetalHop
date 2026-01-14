import { execSync } from 'node:child_process';

/**
 * Adds a peer to the running WireGuard interface
 * @param publicKey The peer's public key
 * @param allowedIps The peer's allowed IPs (comma separated)
 */
export async function addPeerToInterface(publicKey: string, allowedIps: string) {
    try {
        // wg set wg0 peer <KEY> allowed-ips <IP>
        const command = `wg set wg0 peer "${publicKey}" allowed-ips "${allowedIps}"`;
        console.log(`Executing: ${command}`);
        execSync(command);
        console.log('Peer added to WireGuard interface successfully');
    } catch (e) {
        console.error('Failed to add peer to WireGuard interface:', e);
        // Don't throw, just log. 
    }
}
