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

    // Generate DNAT rules for prerouting
    const preroutingRules = forwardsList
        .map(
            (f) =>
                `    ${f.protocol} dport ${f.publicPort} dnat to ${f.wgIp}:${f.privatePort}`
        )
        .join('\n');

    return `#!/usr/sbin/nft -f
# WireGuard Ingress Manager - Auto-generated rules
# Generated at: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY

flush ruleset

table ip nat {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
${preroutingRules}
  }

  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    masquerade
  }
}

table ip filter {
  chain forward {
    type filter hook forward priority filter; policy accept;
    ct state established,related accept
    accept
  }
}
`;
}
