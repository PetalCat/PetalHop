<script lang="ts">
	import { onMount } from 'svelte';
	import { showConfirm, showToast } from '$lib/components/Notifications.svelte';
	import QRCode from 'qrcode';

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
		return `docker run -d --restart=unless-stopped --name=petalhop-agent --cap-add=NET_ADMIN --net=host -e TOKEN=${token} -e CONTROLLER_URL=${controllerUrl} ghcr.io/petalcat/petalhop-agent:latest`;
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
		<div class="card mb-6">
			<h2>🤖 Agents</h2>
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
						{#each agentList as agent}
							<tr>
								<td>
									<span class="status-badge {agent.status}">
										{agent.status === 'active' ? '● Active' : '○ Pending'}
									</span>
								</td>
								<td>{agent.name}</td>
								<td><code>{agent.wgIp}</code></td>
								<td>
									{#if agent.publicKey}
										<code class="key-preview" title={agent.publicKey}>
											{agent.publicKey.slice(0, 8)}...
										</code>
									{:else}
										<span class="text-muted">-</span>
									{/if}
								</td>
								<td>
									<button class="btn btn-danger btn-sm" onclick={() => deleteAgent(agent.id)}>
										Delete
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
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
				Run this command on your agent (VPS/Server) to auto-configure WireGuard:
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
</style>
