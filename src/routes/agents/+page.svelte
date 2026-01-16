<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { fade, slide } from 'svelte/transition';
	import TrafficGraph from '$lib/components/TrafficGraph.svelte';
	import { showConfirm, showToast } from '$lib/components/Notifications.svelte';
	import QRCode from 'qrcode';

	let { data }: { data: PageData } = $props();
	let { peers: initialPeers } = data;

	let peers = $state(initialPeers);

	// Stats StateState
	interface PeerStats {
		rx: number; // total bytes
		tx: number; // total bytes
		handshake: number;
		online: boolean;
	}

	interface TrafficPoint {
		time: number;
		rxSpeed: number;
		txSpeed: number;
	}

	let statsHistory = $state<Record<number, TrafficPoint[]>>({});
	let lastStats = $state<Record<number, PeerStats>>({});
	let evSource: EventSource | null = null;

	// Helper to format bytes
	function formatBytes(bytes: number) {
		if (bytes === 0) return '0 B/s';
		const k = 1024;
		const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	onMount(() => {
		// Start Stats Stream
		evSource = new EventSource('/api/stats/stream');

		evSource.onmessage = (event) => {
			const now = Date.now();
			const data = JSON.parse(event.data);

			// data is { peerId: { rx, tx, handshake } }
			for (const [idStr, stat] of Object.entries(data)) {
				const id = Number(idStr);
				const prev = lastStats[id];
				const current = stat as PeerStats;

				let rxSpeed = 0;
				let txSpeed = 0;

				if (prev) {
					// Calculate speed (assumes ~1s interval)
					rxSpeed = Math.max(0, current.rx - prev.rx);
					txSpeed = Math.max(0, current.tx - prev.tx);
				}

				// Update History
				if (!statsHistory[id]) statsHistory[id] = [];
				statsHistory[id].push({ time: now, rxSpeed, txSpeed });

				// Keep last 60 points
				if (statsHistory[id].length > 60) {
					statsHistory[id].shift();
				}

				// Update Last Stats
				lastStats[id] = current;
			}
		};
	});

	onDestroy(() => {
		if (evSource) evSource.close();
	});
	interface Agent {
		id: number;
		name: string;
		wgIp: string;
		status: 'pending' | 'active';
		publicKey: string | null;
		type: 'agent' | 'device';
	}

	let agents = $state<Agent[]>([]);
	let loading = $state(true);
	let controllerUrl = $state('');

	// Derived lists
	let agentList = $derived(agents.filter((a) => a.type === 'agent'));
	let deviceList = $derived(agents.filter((a) => a.type === 'device'));

	// Form state
	let peerType = $state<'agent' | 'device'>('agent');
	let name = $state('');
	let wgIp = $state('');
	let submitting = $state(false);
	let error = $state('');

	// Setup Token Modal
	let setupToken = $state('');
	let showSetupModal = $state(false);

	// Device Modal
	let showDeviceModal = $state(false);
	let deviceConfig = $state<{
		privateKey: string;
		publicKey: string;
		wgIp: string;
		serverPublicKey: string;
		serverEndpoint: string;
		qrCode: string;
		configText: string;
	} | null>(null);

	onMount(async () => {
		await Promise.all([loadAgents(), loadSettings()]);
	});

	async function loadSettings() {
		try {
			const res = await fetch('/api/auth/me');
			if (res.ok) {
				const data = await res.json();
				// Use current origin as default if not set
				controllerUrl = data.controllerUrl || window.location.origin;
			}
		} catch (e) {
			console.error('Failed to load settings:', e);
		}
	}

	async function loadAgents() {
		loading = true;
		try {
			const res = await fetch('/api/agents');
			agents = await res.json();
		} catch (e) {
			console.error('Failed to load agents:', e);
		}
		loading = false;
	}

	async function addAgent(type: 'agent' | 'device') {
		if (!name) {
			error = 'Name is required';
			return;
		}

		submitting = true;
		error = '';

		try {
			const res = await fetch('/api/agents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, wgIp, type })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Failed to add peer';
			} else {
				if (type === 'agent') {
					setupToken = data.token;
					showSetupModal = true;
				} else {
					// Device flow
					let finalEndpoint = data.serverEndpoint;

					// Prompt for Endpoint if missing
					if (!finalEndpoint) {
						const input = prompt(
							'Please enter the Server Public IP/Endpoint (e.g. 1.2.3.4:51820):'
						);
						if (input) {
							finalEndpoint = input;
							// Optimistically save it for future?
							// Maybe not, user said "prompt me for the pub IP if it doesnt exist already".
							// Doesn't imply saving, but saving helps. I'll just use it for now.
						} else {
							// Default or warn?
							showToast(
								'Warning: No endpoint configured. VPN configuration may be incomplete.',
								'warning'
							);
						}
					}

					const configText = `[Interface]
PrivateKey = ${data.privateKey}
Address = ${data.wgIp}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${data.serverPublicKey}
AllowedIPs = 0.0.0.0/0
Endpoint = ${finalEndpoint}
PersistentKeepalive = 25`;

					const qrCode = await QRCode.toDataURL(configText);

					deviceConfig = {
						privateKey: data.privateKey,
						publicKey: data.publicKey,
						wgIp: data.wgIp,
						serverPublicKey: data.serverPublicKey,
						serverEndpoint: finalEndpoint,
						qrCode,
						configText
					};
					showDeviceModal = true;
				}

				name = '';
				wgIp = '';
				await loadAgents();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		}

		submitting = false;
	}

	async function deleteAgent(id: number) {
		const confirmed = await showConfirm({
			title: 'Delete Agent',
			message:
				'Are you sure you want to delete this agent? All associated port forwards will also be deleted.',
			confirmLabel: 'Delete',
			isDanger: true
		});

		if (!confirmed) return;

		try {
			await fetch('/api/agents', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			showToast('Agent deleted', 'success');
			await loadAgents();
		} catch (e) {
			console.error('Failed to delete agent:', e);
			showToast('Failed to delete agent', 'error');
		}
	}

	function getSetupCommand(token: string) {
		return `docker run -d --name petalhop-agent --restart=unless-stopped --network host --cap-add=NET_ADMIN -e TOKEN="${token}" -e CONTROLLER_URL="${controllerUrl}" ghcr.io/petalcat/petalhop-agent:latest`;
	}

	async function copyCommand() {
		const cmd = getSetupCommand(setupToken);
		await navigator.clipboard.writeText(cmd);
		showToast('Command copied to clipboard', 'success');
	}

	function downloadConfig() {
		if (!deviceConfig) return;
		const blob = new Blob([deviceConfig.configText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `petalhop-${deviceConfig.wgIp}.conf`;
		a.click();
		URL.revokeObjectURL(url);
	}
	// Port Forwarding Modal
	let showPortsModal = $state(false);
	let selectedPeerId = $state<number | null>(null);
	let peerForwards = $state<any[]>([]);

	// New Forward Form
	let newForwardPublicPort = $state('');
	let newForwardPrivatePort = $state('');
	let newForwardProtocol = $state<'tcp' | 'udp'>('tcp');
	let forwardSubmitting = $state(false);

	async function openPortsModal(peerId: number) {
		selectedPeerId = peerId;
		await loadForwards(peerId);
		showPortsModal = true;
	}

	async function loadForwards(peerId: number) {
		try {
			// API returns all forwards, filter client side for now or update API?
			// API /api/forwards returns ALL. Filtering client side is fine for small scale.
			const res = await fetch('/api/forwards');
			if (res.ok) {
				const all = await res.json();
				peerForwards = all.filter((f: any) => f.peerId === peerId);
			}
		} catch (e) {
			console.error('Failed to load forwards', e);
		}
	}

	async function addForward() {
		if (!selectedPeerId || !newForwardPublicPort || !newForwardPrivatePort) return;
		forwardSubmitting = true;
		try {
			const res = await fetch('/api/forwards', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					peerId: selectedPeerId,
					protocol: newForwardProtocol,
					publicPort: parseInt(newForwardPublicPort),
					privatePort: parseInt(newForwardPrivatePort)
				})
			});
			if (res.ok) {
				newForwardPublicPort = '';
				newForwardPrivatePort = '';
				await loadForwards(selectedPeerId);
				showToast('Port forward added', 'success');
			} else {
				const d = await res.json();
				showToast(d.error || 'Failed to add forward', 'error');
			}
		} catch (e) {
			showToast('Failed to add forward', 'error');
		}
		forwardSubmitting = false;
	}

	async function deleteForward(id: number) {
		if (!confirm('Delete this rule?')) return;
		try {
			const res = await fetch('/api/forwards', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (res.ok) {
				if (selectedPeerId) await loadForwards(selectedPeerId);
				showToast('Rule deleted', 'success');
			}
		} catch (e) {
			showToast('Failed to delete rule', 'error');
		}
	}
</script>

<svelte:head>
	<title>Network - PetalHop</title>
</svelte:head>

<div class="animate-in">
	<div class="header">
		<h1>Network</h1>
		<p class="text-muted">Manage your connected Agents and Devices</p>
	</div>

	<div class="card mb-6">
		<h2>Add to Network</h2>

		<div class="type-selector mb-4">
			<button
				class="type-btn"
				class:active={peerType === 'agent'}
				onclick={() => (peerType = 'agent')}
			>
				🤖 Agent
			</button>
			<button
				class="type-btn"
				class:active={peerType === 'device'}
				onclick={() => (peerType = 'device')}
			>
				📱 Device
			</button>
		</div>

		<form
			class="add-form"
			onsubmit={(e) => {
				e.preventDefault();
				addAgent(peerType);
			}}
		>
			<div class="form-row">
				<div class="form-group">
					<label for="name">Name</label>
					<input
						id="name"
						type="text"
						placeholder={peerType === 'agent' ? 'e.g. game-server-1' : 'e.g. iPhone'}
						bind:value={name}
					/>
				</div>
				<div class="form-group">
					<label for="wgIp">WireGuard IP</label>
					<input id="wgIp" type="text" placeholder="Auto-assign if empty" bind:value={wgIp} />
				</div>
				<button class="btn btn-primary" type="submit" disabled={submitting}>
					{submitting ? 'Creating...' : peerType === 'agent' ? '+ Create Agent' : '+ Add Device'}
				</button>
			</div>
			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</form>
	</div>

	<!-- Agents Section -->
	{#if agentList.length > 0}
		<h2 class="section-title mb-4">🤖 Agents</h2>
		<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each agentList as agent}
				{@const stats = lastStats[agent.id]}
				<div class="card agent-card">
					<!-- Header -->
					<div class="mb-4 flex items-start justify-between">
						<div>
							<a
								href="/agents/{agent.id}"
								class="hover:text-primary text-lg font-bold transition-colors"
							>
								{agent.name}
							</a>
							<div class="text-muted mt-1 font-mono text-xs">{agent.wgIp}</div>
						</div>

						{#if agent.status === 'pending'}
							<span class="status-badge pending">Pending</span>
						{:else if stats?.online}
							<span
								class="status-badge active"
								title="Handshake: {Math.floor((Date.now() - stats.handshake * 1000) / 1000)}s ago"
							>
								Online
							</span>
						{:else}
							<span class="status-badge offline">Offline</span>
						{/if}
					</div>

					<!-- Traffic Graph -->
					<div class="mt-auto">
						<div class="mb-1 flex justify-between font-mono text-[10px]">
							<span class="text-emerald-500"
								>↓ {formatBytes(statsHistory[agent.id]?.at(-1)?.rxSpeed || 0)}</span
							>
							<span class="text-blue-500"
								>↑ {formatBytes(statsHistory[agent.id]?.at(-1)?.txSpeed || 0)}</span
							>
						</div>
						<div
							class="bg-base-200/50 border-base-300 mb-4 h-10 w-full overflow-hidden rounded border"
						>
							<TrafficGraph data={statsHistory[agent.id] || []} height={40} />
						</div>
					</div>

					<!-- Footer / Actions -->
					<div class="border-border mt-2 flex items-center justify-between border-t pt-3">
						{#if agent.publicKey}
							<code class="text-muted text-xs" title={agent.publicKey}>
								{agent.publicKey.slice(0, 12)}...
							</code>
						{:else}
							<span></span>
						{/if}

						<div class="flex gap-2">
							<button class="btn btn-ghost btn-xs" onclick={() => openPortsModal(agent.id)}>
								Ports
							</button>
							<button
								class="btn btn-ghost btn-xs text-danger hover:bg-danger/10"
								onclick={() => deleteAgent(agent.id)}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Devices Section -->
	{#if deviceList.length > 0 || agentList.length === 0}
		<div class="card">
			<h2>📱 Devices</h2>
			{#if deviceList.length === 0}
				<p class="text-muted">No devices connected.</p>
			{:else}
				<div class="table-container">
					<table>
						<thead>
							<tr>
								<th>Status</th>
								<th>Name</th>
								<th>IP</th>
								<th>Public Key</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each deviceList as device}
								<tr>
									<td>
										<span class="status-badge active">● Active</span>
									</td>
									<td>{device.name}</td>
									<td><code>{device.wgIp}</code></td>
									<td>
										<code class="key-preview" title={device.publicKey}>
											{device.publicKey?.slice(0, 8)}...
										</code>
									</td>
									<td>
										<button class="btn btn-danger btn-sm" onclick={() => deleteAgent(device.id)}>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Setup Modal -->
{#if showSetupModal}
	<div
		class="modal-overlay"
		role="presentation"
		tabindex="-1"
		onclick={() => (showSetupModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showSetupModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			tabindex="0"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3 class="modal-title">Agent Setup</h3>
			<p class="modal-message">
				Run this command on your <strong>Linux</strong> agent (VPS/Server) to auto-configure WireGuard:
			</p>

			<div class="command-box">
				<code>{getSetupCommand(setupToken)}</code>
				<button class="copy-btn" onclick={copyCommand} title="Copy command">📋</button>
			</div>

			<div class="modal-actions">
				<button class="btn btn-primary" onclick={() => (showSetupModal = false)}> Done </button>
			</div>
		</div>
	</div>
{/if}

<!-- Device Setup Modal -->
{#if showDeviceModal && deviceConfig}
	<div
		class="modal-overlay"
		role="presentation"
		tabindex="-1"
		onclick={() => (showDeviceModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showDeviceModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			tabindex="0"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3 class="modal-title">Device Configuration</h3>
			<p class="modal-message">
				Scan the QR code or download the configuration file to connect your device.
			</p>

			<div class="qr-container">
				<img src={deviceConfig.qrCode} alt="WireGuard QR Code" class="qr-code" />
			</div>

			<div class="config-actions">
				<button class="btn btn-secondary" onclick={downloadConfig}>⬇️ Download .conf</button>
			</div>

			<div class="config-preview">
				<pre>{deviceConfig.configText}</pre>
			</div>

			<div class="modal-actions">
				<button class="btn btn-primary" onclick={() => (showDeviceModal = false)}> Done </button>
			</div>
		</div>
	</div>
{/if}

<!-- Ports Modal -->
{#if showPortsModal}
	<div
		class="modal-overlay"
		role="presentation"
		tabindex="-1"
		onclick={() => (showPortsModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showPortsModal = false)}
	>
		<div
			class="modal"
			role="dialog"
			tabindex="0"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3 class="modal-title">Port Forwarding Rules</h3>
			<p class="modal-message">
				Map public ports on this controller to private ports on the agent.
			</p>

			<div class="table-container mb-4">
				<table>
					<thead>
						<tr>
							<th>Protocol</th>
							<th>Public Port</th>
							<th>➜</th>
							<th>Private Port</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{#each peerForwards as fw}
							<tr>
								<td class="uppercase">{fw.protocol}</td>
								<td>{fw.publicPort}</td>
								<td>➜</td>
								<td>{fw.privatePort}</td>
								<td>
									<button class="btn btn-danger btn-sm" onclick={() => deleteForward(fw.id)}>
										×
									</button>
								</td>
							</tr>
						{/each}
						{#if peerForwards.length === 0}
							<tr>
								<td colspan="5" class="text-muted text-center">No rules configured.</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>

			<div class="border-border mt-4 border-t pt-4">
				<h4 class="mb-2 text-sm font-medium">Add Rule</h4>
				<div class="flex items-end gap-2">
					<div class="form-group w-24">
						<label class="text-xs" for="proto">Protocol</label>
						<select id="proto" bind:value={newForwardProtocol} class="rounded border p-2">
							<option value="tcp">TCP</option>
							<option value="udp">UDP</option>
						</select>
					</div>
					<div class="form-group">
						<label class="text-xs" for="pub">Public</label>
						<input id="pub" type="number" placeholder="25565" bind:value={newForwardPublicPort} />
					</div>
					<div class="form-group">
						<label class="text-xs" for="priv">Private</label>
						<input id="priv" type="number" placeholder="25565" bind:value={newForwardPrivatePort} />
					</div>
					<button class="btn btn-primary" onclick={addForward} disabled={forwardSubmitting}>
						{forwardSubmitting ? '...' : 'Add'}
					</button>
				</div>
			</div>

			<div class="modal-actions mt-4">
				<button class="btn btn-secondary" onclick={() => (showPortsModal = false)}> Close </button>
			</div>
		</div>
	</div>
{/if}

<style>
	.header {
		margin-bottom: 2rem;
	}

	.add-form {
		margin-top: 1rem;
	}

	.form-row {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
	}

	.form-group {
		flex: 1;
	}

	.error-text {
		color: var(--color-danger);
		font-size: 0.875rem;
		margin-top: 0.75rem;
	}

	/* Status Badges */
	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.status-badge.active {
		background: oklch(0.9 0.1 140 / 0.15);
		color: var(--color-success);
	}

	.status-badge.pending {
		background: oklch(0.9 0.05 60 / 0.15);
		color: oklch(0.7 0.1 60);
	}

	.key-preview {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Setup Modal Styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
	}

	.modal {
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		max-width: 600px;
		width: 90%;
		box-shadow: var(--shadow-lg);
	}

	.modal-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
	}

	.modal-message {
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.command-box {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		overflow-x: auto;
	}

	.command-box code {
		flex: 1;
		white-space: nowrap;
	}

	.copy-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-sm);
	}

	.copy-btn:hover {
		background: var(--color-bg-elevated);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}

	/* Type Selector */
	.type-selector {
		display: flex;
		gap: 0.5rem;
		background: var(--color-bg);
		padding: 0.25rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		width: fit-content;
	}

	.type-btn {
		background: none;
		border: none;
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.type-btn:hover {
		color: var(--color-text);
	}

	.type-btn.active {
		background: var(--color-bg-card);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	/* QR Code & Config */
	.qr-container {
		display: flex;
		justify-content: center;
		margin: 1.5rem 0;
	}

	.qr-code {
		border-radius: var(--radius-md);
		border: 4px solid white;
		max-width: 200px;
	}

	.config-actions {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.config-preview {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 1rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		overflow-x: auto;
		max-height: 200px;
	}

	.config-preview pre {
		margin: 0;
	}

	.uppercase {
		text-transform: uppercase;
	}

	.status-badge.active {
		background: oklch(0.95 0.05 150);
		color: oklch(0.4 0.1 150);
	}

	.status-badge.offline {
		background: oklch(0.95 0.05 0);
		color: oklch(0.4 0.1 0);
	}

	.status-badge.pending {
		background: var(--color-bg-card);
		color: var(--color-text-muted);
		border: 1px dashed var(--color-border);
	}
</style>
