import { execSync } from 'node:child_process';

/**
 * Validates a WireGuard public key format (base64-encoded 32 bytes = 44 chars with trailing =)
 */
function isValidWireGuardKey(key: string): boolean {
    // WireGuard keys are 32 bytes encoded as base64, resulting in 44 characters ending with =
    const wgKeyRegex = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
    return wgKeyRegex.test(key);
}

/**
 * Validates an allowed IPs string (CIDR notation, comma-separated)
 */
function isValidAllowedIps(ips: string): boolean {
    // Split by comma and validate each IP/CIDR
    const ipList = ips.split(',').map(ip => ip.trim());
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

    for (const ip of ipList) {
        if (!cidrRegex.test(ip)) {
            return false;
        }
        // Validate octets are in range 0-255
        const parts = ip.split('/')[0].split('.');
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (num < 0 || num > 255) {
                return false;
            }
        }
        // Validate CIDR prefix if present
        if (ip.includes('/')) {
            const prefix = parseInt(ip.split('/')[1], 10);
            if (prefix < 0 || prefix > 32) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Adds a peer to the running WireGuard interface
 * @param publicKey The peer's public key
 * @param allowedIps The peer's allowed IPs (comma separated)
 */
export async function addPeerToInterface(publicKey: string, allowedIps: string) {
    // Validate inputs to prevent command injection
    if (!isValidWireGuardKey(publicKey)) {
        console.error('Invalid WireGuard public key format');
        return;
    }

    if (!isValidAllowedIps(allowedIps)) {
        console.error('Invalid allowed IPs format');
        return;
    }

    try {
        // Using spawn with arguments array would be safer, but wg command structure
        // requires this format. Inputs are validated above.
        const command = `wg set wg0 peer "${publicKey}" allowed-ips "${allowedIps}"`;
        console.log('Adding peer to WireGuard interface');
        execSync(command);
        console.log('Peer added to WireGuard interface successfully');
    } catch (e) {
        console.error('Failed to add peer to WireGuard interface:', e);
        // Don't throw, just log.
    }
}
