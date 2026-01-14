<script lang="ts">
	import { onMount } from 'svelte';

	interface Peer {
		id: number;
		name: string;
		wgIp: string;
	}

	interface Forward {
		id: number;
		peerId: number;
		protocol: 'tcp' | 'udp';
		publicPort: number;
		privatePort: number;
		peerName: string;
		wgIp: string;
	}

	let forwards = $state<Forward[]>([]);
	let peers = $state<Peer[]>([]);
	let loading = $state(true);

	// Form state
	let peerId = $state<number | null>(null);
	let protocol = $state<'tcp' | 'udp'>('tcp');
	let publicPort = $state('');
	let privatePort = $state('');
	let submitting = $state(false);
	let error = $state('');
	let applying = $state(false);
	let applyMessage = $state('');

	onMount(async () => {
		await Promise.all([loadForwards(), loadPeers()]);
	});

	async function loadForwards() {
		try {
			const res = await fetch('/api/forwards');
			forwards = await res.json();
		} catch (e) {
			console.error('Failed to load forwards:', e);
		}
		loading = false;
	}

	async function loadPeers() {
		try {
			const res = await fetch('/api/peers');
			peers = await res.json();
			if (peers.length > 0 && !peerId) {
				peerId = peers[0].id;
			}
		} catch (e) {
			console.error('Failed to load peers:', e);
		}
	}

	async function addForward() {
		if (!peerId || !publicPort || !privatePort) {
			error = 'All fields are required';
			return;
		}

		submitting = true;
		error = '';

		try {
			const res = await fetch('/api/forwards', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					peerId,
					protocol,
					publicPort: Number(publicPort),
					privatePort: Number(privatePort)
				})
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Failed to add forward';
			} else {
				publicPort = '';
				privatePort = '';
				await loadForwards();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		}

		submitting = false;
	}

	import { showConfirm } from '$lib/components/Notifications.svelte';

	// ...

	async function deleteForward(id: number) {
		const confirmed = await showConfirm({
			title: 'Delete Forward',
			message: 'Are you sure you want to delete this port forwarding rule?',
			confirmLabel: 'Delete',
			isDanger: true
		});

		if (!confirmed) return;

		try {
			await fetch('/api/forwards', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			await loadForwards();
		} catch (e) {
			console.error('Failed to delete forward:', e);
		}
	}

	async function applyRules() {
		applying = true;
		applyMessage = '';
		try {
			const res = await fetch('/api/apply', { method: 'POST' });
			const data = await res.json();

			if (data.applied) {
				applyMessage = '✅ Rules applied successfully!';
			} else {
				applyMessage = `❌ Failed: ${data.error}`;
			}
		} catch (e) {
			applyMessage = `❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
		}
		applying = false;
	}
</script>

<div class="animate-in">
	<div class="header mb-6 flex items-center justify-between">
		<h1>Port Forwards</h1>
		<button class="btn btn-success" onclick={applyRules} disabled={applying}>
			{applying ? '⏳ Applying...' : '🚀 Apply Rules'}
		</button>
	</div>

	{#if applyMessage}
		<div class="apply-message mb-4" class:success={applyMessage.startsWith('✅')}>
			{applyMessage}
		</div>
	{/if}

	<div class="card mb-6">
		<h2>Add New Forward</h2>
		{#if peers.length === 0}
			<p class="text-muted">No peers available. <a href="/peers">Add a peer first</a>.</p>
		{:else}
			<form
				class="add-form"
				onsubmit={(e) => {
					e.preventDefault();
					addForward();
				}}
			>
				<div class="form-row">
					<div class="form-group">
						<label for="peer">Peer</label>
						<select id="peer" bind:value={peerId}>
							{#each peers as peer}
								<option value={peer.id}>{peer.name} ({peer.wgIp})</option>
							{/each}
						</select>
					</div>
					<div class="form-group">
						<label for="protocol">Protocol</label>
						<select id="protocol" bind:value={protocol}>
							<option value="tcp">TCP</option>
							<option value="udp">UDP</option>
						</select>
					</div>
					<div class="form-group">
						<label for="publicPort">Public Port</label>
						<input id="publicPort" type="number" placeholder="e.g. 25565" bind:value={publicPort} />
					</div>
					<div class="form-group">
						<label for="privatePort">Private Port</label>
						<input
							id="privatePort"
							type="number"
							placeholder="e.g. 25565"
							bind:value={privatePort}
						/>
					</div>
					<button class="btn btn-primary" type="submit" disabled={submitting}>
						{submitting ? 'Adding...' : '+ Add Forward'}
					</button>
				</div>
				{#if error}
					<p class="error-text">{error}</p>
				{/if}
			</form>
		{/if}
	</div>

	<div class="card">
		<h2>Active Forwards</h2>
		{#if loading}
			<p class="text-muted">Loading...</p>
		{:else if forwards.length === 0}
			<p class="text-muted">No forwards configured yet.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Protocol</th>
						<th>Public Port</th>
						<th>Destination</th>
						<th>Peer</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each forwards as forward}
						<tr>
							<td>
								<span
									class="badge"
									class:badge-tcp={forward.protocol === 'tcp'}
									class:badge-udp={forward.protocol === 'udp'}
								>
									{forward.protocol}
								</span>
							</td>
							<td><code>{forward.publicPort}</code></td>
							<td><code>{forward.wgIp}:{forward.privatePort}</code></td>
							<td>{forward.peerName}</td>
							<td>
								<button class="btn btn-danger btn-sm" onclick={() => deleteForward(forward.id)}>
									Delete
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	.add-form {
		margin-top: 1rem;
	}

	.form-row {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
	}

	.form-group {
		flex: 1;
		min-width: 120px;
	}

	.error-text {
		color: var(--color-danger);
		font-size: 0.875rem;
		margin-top: 0.75rem;
	}

	.apply-message {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
	}

	.apply-message.success {
		border-color: var(--color-success);
		background: oklch(0.7 0.15 145 / 0.1);
	}
</style>
