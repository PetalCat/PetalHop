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
	onMount(async () => {
		const res = await fetch(`/api/stats/history?peerId=${peer.id}`);
		if (res.ok) {
			history = await res.json();
		}
		loading = false;

		// Connect to SSE for realtime
		const evSource = new EventSource('/api/stats/stream');
		evSource.onmessage = (event) => {
			const allStats = JSON.parse(event.data);
			if (allStats[peer.id]) {
				realtimeStats = allStats[peer.id];
			}
		};

		return () => evSource.close();
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

<div class="animate-in">
	<div class="header mb-6">
		<div class="flex items-center gap-4">
			<a href="/agents" class="btn btn-ghost btn-sm">← Back</a>
			<h1>{peer.name}</h1>
			{#if realtimeStats.online}
				<span class="badge badge-success">Online</span>
			{:else}
				<span class="badge badge-danger">Offline</span>
			{/if}
		</div>
		<p class="text-muted mt-1 ml-20 font-mono text-sm">{peer.wgIp}</p>
	</div>

	<!-- Usage Cards -->
	<div class="mb-8 grid grid-cols-3 gap-4">
		<div class="stat-card">
			<div class="stat-label">Last 24 Hours</div>
			<div class="stat-value">
				{formatBytes(history.hourly.reduce((acc, h) => acc + h.rx + h.tx, 0))}
			</div>
			<div class="text-muted mt-2 flex justify-between text-xs">
				<span>↓ {formatBytes(history.hourly.reduce((acc, h) => acc + h.rx, 0))}</span>
				<span>↑ {formatBytes(history.hourly.reduce((acc, h) => acc + h.tx, 0))}</span>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-label">This Month</div>
			<div class="stat-value">
				{formatBytes(history.monthly[0]?.rx + history.monthly[0]?.tx || 0)}
			</div>
			<div class="text-muted mt-2 flex justify-between text-xs">
				<span>↓ {formatBytes(history.monthly[0]?.rx || 0)}</span>
				<span>↑ {formatBytes(history.monthly[0]?.tx || 0)}</span>
			</div>
		</div>

		<div class="stat-card">
			<div class="stat-label">Current Live Speed</div>
			<div class="stat-value text-lg text-emerald-500">
				↓ {formatBytes(realtimeStats.rx)}/s
			</div>
			<div class="stat-value text-lg text-blue-500">
				↑ {formatBytes(realtimeStats.tx)}/s
			</div>
		</div>
	</div>

	<!-- Charts -->
	<div class="card mb-8">
		<h2>24-Hour Usage History</h2>
		{#if loading}
			<p>Loading stats...</p>
		{:else if history.hourly.length === 0}
			<p class="text-muted">No data available yet.</p>
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
			<p class="text-muted mt-2 text-center text-xs">Hourly totals (Rx/Tx)</p>
		{/if}
	</div>

	<div class="card">
		<h2>Configuration</h2>
		<div class="bg-base-200 overflow-auto rounded-md p-4 font-mono text-xs">
			<div class="text-muted mb-2 font-bold">Public Key</div>
			<div>{peer.publicKey}</div>
		</div>
	</div>
</div>

<style>
	.badge-success {
		background: var(--color-success);
		color: white;
	}
	.badge-danger {
		background: var(--color-danger);
		color: white;
	}
</style>
