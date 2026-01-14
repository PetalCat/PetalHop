<script lang="ts">
	import { onMount } from 'svelte';

	let peerCount = $state(0);
	let forwardCount = $state(0);
	let rulesPreview = $state('');
	let loading = $state(true);
	let applying = $state(false);
	let applyMessage = $state('');

	onMount(async () => {
		await loadStats();
	});

	async function loadStats() {
		loading = true;
		try {
			const [peersRes, forwardsRes, rulesRes] = await Promise.all([
				fetch('/api/peers'),
				fetch('/api/forwards'),
				fetch('/api/apply')
			]);

			const peers = await peersRes.json();
			const forwards = await forwardsRes.json();
			const rulesData = await rulesRes.json();

			peerCount = peers.length;
			forwardCount = forwards.length;
			rulesPreview = rulesData.rules;
		} catch (e) {
			console.error('Failed to load stats:', e);
		}
		loading = false;
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
		<h1>Dashboard</h1>
		<button class="btn btn-success" onclick={applyRules} disabled={applying}>
			{applying ? '⏳ Applying...' : '🚀 Apply Rules'}
		</button>
	</div>

	{#if applyMessage}
		<div class="apply-message mb-4" class:success={applyMessage.startsWith('✅')}>
			{applyMessage}
		</div>
	{/if}

	<div class="stats-grid mb-6 grid grid-cols-3 gap-4">
		<div class="stat-card">
			<div class="stat-value">{loading ? '...' : peerCount}</div>
			<div class="stat-label">WireGuard Peers</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{loading ? '...' : forwardCount}</div>
			<div class="stat-label">Port Forwards</div>
		</div>
		<div class="stat-card">
			<div class="stat-value" style="color: var(--color-success)">●</div>
			<div class="stat-label">System Status</div>
		</div>
	</div>

	<div class="card">
		<h2>Current Rules Preview</h2>
		{#if loading}
			<p class="text-muted">Loading...</p>
		{:else}
			<pre>{rulesPreview}</pre>
		{/if}
	</div>
</div>

<style>
	.stats-grid {
		margin-bottom: 1.5rem;
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
