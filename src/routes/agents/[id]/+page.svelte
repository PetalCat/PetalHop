<script lang="ts">
	import { onMount } from 'svelte';
	import TrafficGraph from '$lib/components/TrafficGraph.svelte';
	import { page } from '$app/stores';

	let { data } = $props();
	let { peer } = data;

	let history = $state<{ hourly: any[]; monthly: any[] }>({ hourly: [], monthly: [] });
	let loading = $state(true);

	// Stats State for Realtime
	let realtimeStats = $state({ rx: 0, tx: 0, handshake: 0, online: false });

	// Fetch History
	onMount(() => {
		let evSource: EventSource | undefined;

		(async () => {
			const res = await fetch(`/api/stats/history?peerId=${peer.id}`);
			if (res.ok) {
				history = await res.json();
			}
			loading = false;

			// Connect to SSE for realtime
			evSource = new EventSource('/api/stats/stream');
			evSource.onmessage = (event) => {
				const allStats = JSON.parse(event.data);
				if (allStats[peer.id]) {
					realtimeStats = allStats[peer.id];
				}
			};
		})();

		return () => {
			if (evSource) evSource.close();
		};
	});

	function formatBytes(bytes: number) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<svelte:head>
	<title>{peer.name} - Agent Details</title>
</svelte:head>

<div class="animate-in mx-auto max-w-5xl">
	<!-- Header -->
	<div class="header mb-8 flex flex-col gap-4">
		<a href="/agents" class="btn btn-ghost btn-sm w-fit gap-2">
			<span>←</span> Back to Agents
		</a>

		<div class="border-border flex items-end justify-between border-b pb-6">
			<div>
				<h1 class="mb-2 flex items-center gap-3 text-3xl font-bold">
					{peer.name}
					{#if realtimeStats.online}
						<span class="badge badge-success px-3 py-1 text-sm">Online</span>
					{:else}
						<span class="badge badge-danger px-3 py-1 text-sm">Offline</span>
					{/if}
				</h1>
				<div class="text-muted flex items-center gap-2 font-mono text-sm">
					<span>IP:</span>
					<code class="bg-bg-input text-text rounded px-2 py-0.5">{peer.wgIp}</code>
				</div>
			</div>

			<div class="flex gap-2">
				<button class="btn btn-secondary" onclick={() => window.location.reload()}>
					Refresh
				</button>
			</div>
		</div>
	</div>

	<!-- Usage Cards -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
		<div class="stat-card">
			<div class="stat-label flex items-center gap-2">
				<span>🕒</span> Last 24 Hours
			</div>
			<div class="stat-value mt-2 text-3xl">
				{formatBytes(history.hourly.reduce((acc, h) => acc + h.rx + h.tx, 0))}
			</div>
			<div class="border-border/50 mt-4 flex justify-between border-t pt-3 text-xs font-medium">
				<span class="text-emerald-500"
					>↓ {formatBytes(history.hourly.reduce((acc, h) => acc + h.rx, 0))}</span
				>
				<span class="text-blue-500"
					>↑ {formatBytes(history.hourly.reduce((acc, h) => acc + h.tx, 0))}</span
				>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-label flex items-center gap-2">
				<span>📅</span> This Month
			</div>
			<div class="stat-value mt-2 text-3xl">
				{formatBytes(history.monthly[0]?.rx + history.monthly[0]?.tx || 0)}
			</div>
			<div class="border-border/50 mt-4 flex justify-between border-t pt-3 text-xs font-medium">
				<span class="text-emerald-500">↓ {formatBytes(history.monthly[0]?.rx || 0)}</span>
				<span class="text-blue-500">↑ {formatBytes(history.monthly[0]?.tx || 0)}</span>
			</div>
		</div>

		<div class="stat-card relative overflow-hidden">
			<div class="absolute -top-4 -right-4 text-6xl opacity-5">⚡</div>
			<div class="stat-label flex items-center gap-2">
				<span>⚡</span> Live Speed
			</div>
			<div class="mt-2 flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="text-muted text-sm">Download</span>
					<span class="text-xl font-bold text-emerald-500">↓ {formatBytes(realtimeStats.rx)}/s</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted text-sm">Upload</span>
					<span class="text-xl font-bold text-blue-500">↑ {formatBytes(realtimeStats.tx)}/s</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Charts -->
	<div class="card mb-8">
		<div class="mb-6 flex items-center justify-between">
			<h2 class="m-0">24-Hour Usage History</h2>
			<select
				class="select select-sm bg-bg-input border-border w-32 rounded disabled:opacity-50"
				disabled
			>
				<option>Last 24h</option>
				<option>Last 7d</option>
			</select>
		</div>
		{#if loading}
			<div class="text-muted flex h-64 items-center justify-center">Loading stats...</div>
		{:else if history.hourly.length === 0}
			<div class="text-muted flex h-64 flex-col items-center justify-center gap-2">
				<span class="text-2xl">📊</span>
				<p>No historical data available yet.</p>
			</div>
		{:else}
			<div class="h-64 w-full">
				<!-- Transform hourly data to graph format -->
				<TrafficGraph
					data={history.hourly
						.map((h) => ({
							time: h.timestamp * 1000,
							rxSpeed: h.rx, // Graph expects speed but we give totals for the hour block
							txSpeed: h.tx // Reusing graph component slightly incorrectly but visuals will work
						}))
						.reverse()}
					height={250}
				/>
			</div>
			<!-- Legend -->
			<div class="mt-4 flex justify-center gap-6 text-xs font-medium">
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
					<span>Download</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full bg-blue-500"></span>
					<span>Upload</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="card">
			<h2 class="mb-4">Configuration</h2>
			<div class="space-y-4">
				<div>
					<label class="text-muted mb-1 block text-xs font-bold tracking-wider uppercase"
						>Public Key</label
					>
					<div class="flex gap-2">
						<code class="bg-bg-input border-border flex-1 rounded border p-3 text-xs break-all"
							>{peer.publicKey}</code
						>
					</div>
				</div>
				<div>
					<label class="text-muted mb-1 block text-xs font-bold tracking-wider uppercase"
						>WireGuard IP</label
					>
					<code class="bg-bg-input border-border rounded border p-2 text-sm">{peer.wgIp}</code>
				</div>
			</div>
		</div>

		<!-- Placeholder for future functionality or metadata -->
		<div class="card pointer-events-none opacity-50">
			<h2 class="mb-4">Metadata</h2>
			<div class="space-y-2 text-sm">
				<div class="border-border flex justify-between border-b py-2">
					<span class="text-muted">Created At</span>
					<span>Unknown</span>
				</div>
				<div class="border-border flex justify-between border-b py-2">
					<span class="text-muted">Last Handshake</span>
					<span
						>{realtimeStats.handshake
							? new Date(realtimeStats.handshake * 1000).toLocaleString()
							: 'Never'}</span
					>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.badge-success {
		background: oklch(0.9 0.1 140 / 0.15);
		color: var(--color-success);
		border: 1px solid var(--color-success);
	}
	.badge-danger {
		background: oklch(0.9 0.05 60 / 0.15);
		color: var(--color-danger);
		border: 1px solid var(--color-danger);
	}
</style>
