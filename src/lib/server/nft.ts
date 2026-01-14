import { db } from '$lib/server/db';
import { peers, forwards } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export interface ForwardWithPeer {
  id: number;
  peerId: number;
  protocol: 'tcp' | 'udp';
  publicPort: number;
  privatePort: number;
  peerName: string;
  wgIp: string;
}

/**
 * Validate and sanitize an IP address for use in nftables rules
 */
function sanitizeIp(ip: string): string | null {
  // Strict IP validation - only allow valid IPv4 addresses
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipRegex);
  if (!match) return null;

  // Validate each octet is 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return null;
  }

  return ip;
}

/**
 * Validate and sanitize a port number for use in nftables rules
 */
function sanitizePort(port: number): number | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

/**
 * Validate protocol is tcp or udp
 */
function sanitizeProtocol(protocol: string): 'tcp' | 'udp' | null {
  if (protocol === 'tcp' || protocol === 'udp') {
    return protocol;
  }
  return null;
}

/**
 * Generate nftables ruleset from database state
 */
export async function generateRules(): Promise<string> {
  // Get all forwards with their peer info
  const forwardsList = await db
    .select({
      id: forwards.id,
      peerId: forwards.peerId,
      protocol: forwards.protocol,
      publicPort: forwards.publicPort,
      privatePort: forwards.privatePort,
      peerName: peers.name,
      wgIp: peers.wgIp
    })
    .from(forwards)
    .innerJoin(peers, eq(forwards.peerId, peers.id));

  // Generate DNAT rules for prerouting with validation
  const preroutingRules = forwardsList
    .map((f) => {
      // Sanitize all inputs before inserting into rules
      const protocol = sanitizeProtocol(f.protocol);
      const publicPort = sanitizePort(f.publicPort);
      const privatePort = sanitizePort(f.privatePort);
      const wgIp = sanitizeIp(f.wgIp);

      // Skip invalid entries
      if (!protocol || !publicPort || !privatePort || !wgIp) {
        console.error(`Skipping invalid forward rule: ${JSON.stringify(f)}`);
        return null;
      }

      return `    ${protocol} dport ${publicPort} dnat to ${wgIp}:${privatePort}`;
    })
    .filter((rule): rule is string => rule !== null)
    .join('\n');

  // Generate explicit forward allow rules (only allow DNAT'd traffic)
  const forwardAllowRules = forwardsList
    .map((f) => {
      const protocol = sanitizeProtocol(f.protocol);
      const privatePort = sanitizePort(f.privatePort);
      const wgIp = sanitizeIp(f.wgIp);

      if (!protocol || !privatePort || !wgIp) {
        return null;
      }

      return `    ${protocol} daddr ${wgIp} dport ${privatePort} accept`;
    })
    .filter((rule): rule is string => rule !== null)
    .join('\n');

  return `#!/usr/sbin/nft -f
# WireGuard Ingress Manager - Auto-generated rules
# Generated at: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY
#
# SECURITY: This ruleset restricts access to WireGuard agents.
# Only explicitly forwarded ports are accessible.
# Direct connections from VPS to agents are BLOCKED.

# Create or reset our tables (using add + flush pattern)
add table ip petalhop_nat
flush table ip petalhop_nat
add table ip petalhop_filter
flush table ip petalhop_filter

table ip petalhop_nat {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
${preroutingRules}
  }

  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    # Masquerade traffic going to WireGuard network
    ip daddr 10.8.0.0/24 masquerade
  }
}

table ip petalhop_filter {
  chain forward {
    type filter hook forward priority filter; policy drop;

    # Allow established/related connections (return traffic)
    ct state established,related accept

    # Allow traffic NOT destined for WireGuard network (don't interfere with other traffic)
    ip daddr != 10.8.0.0/24 accept

    # Only allow forwarded traffic to specific agent:port combinations
    # These are the ONLY paths into the WireGuard network
${forwardAllowRules}

    # BLOCK everything else to WireGuard network
    # This prevents attackers from scanning/accessing agents directly
    ip daddr 10.8.0.0/24 counter drop
  }

  chain output {
    type filter hook output priority filter; policy accept;

    # Allow established connections
    ct state established,related accept

    # Allow loopback
    oif "lo" accept

    # Allow traffic NOT destined for WireGuard network
    ip daddr != 10.8.0.0/24 accept

    # Allow WireGuard protocol itself (UDP to agents)
    udp dport 51820 accept

    # BLOCK direct connections from VPS to WireGuard network
    # This prevents a compromised VPS from accessing agents
    ip daddr 10.8.0.0/24 counter drop
  }
}
`;
}

/**
 * Apply the current ruleset to the system
 */
export async function applyRules(): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');
  const crypto = await import('node:crypto');

  // Generate unique temp file name to prevent race conditions and symlink attacks
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const configPath = path.join(os.tmpdir(), `petalhop-nft-${randomSuffix}.conf`);

  try {
    const rules = await generateRules();

    // Use O_CREAT | O_EXCL flags via writeFile with exclusive flag
    // This ensures the file is newly created and not a symlink
    const fileHandle = await fs.open(configPath, 'wx', 0o600);
    await fileHandle.writeFile(rules);
    await fileHandle.close();

    // Apply rules using nft
    const { execSync } = await import('node:child_process');
    execSync(`nft -f ${configPath}`, { stdio: 'ignore' });

    console.log('NFTables rules applied successfully');
  } catch (e) {
    console.error('Failed to apply NFTables rules:', e);

    // Log the failing rules for debugging
    try {
      const rules = await generateRules();
      console.error('--- FAILING RULES CONTENT ---');
      console.error(rules);
      console.error('-----------------------------');
    } catch (readErr) {
      console.error('Could not read rules for debug:', readErr);
    }
  } finally {
    // Always clean up the temp file
    try {
      await fs.unlink(configPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
