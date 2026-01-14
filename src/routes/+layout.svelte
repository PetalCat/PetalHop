<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Notifications from '$lib/components/Notifications.svelte';

	let { children } = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/agents', label: 'Agents', icon: '🖥️' },
		{ href: '/forwards', label: 'Forwards', icon: '🔀' },
		{ href: '/settings', label: 'Settings', icon: '⚙️' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
		rel="stylesheet"
	/>
	<title>PetalHop - WireGuard Ingress Manager</title>
</svelte:head>

<div class="app-layout">
	<aside class="sidebar">
		<div class="logo">
			<span class="logo-icon">🌸</span>
			<span class="logo-text">PetalHop</span>
		</div>

		<nav class="nav">
			{#each navItems as item}
				<a href={item.href} class="nav-item">
					<span class="nav-icon">{item.icon}</span>
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			<span class="version">v0.1.0</span>
		</div>
	</aside>

	<main class="main-content">
		{@render children()}
	</main>
</div>

<Notifications />

<style>
	.app-layout {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 240px;
		background: var(--color-bg-elevated);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		padding: 1.5rem 1rem;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 0.75rem;
		margin-bottom: 2rem;
	}

	.logo-icon {
		font-size: 1.5rem;
	}

	.logo-text {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, var(--color-primary) 0%, oklch(0.8 0.15 300) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.nav-item:hover {
		background: var(--color-bg-card);
		color: var(--color-text);
	}

	.nav-icon {
		font-size: 1.125rem;
	}

	.nav-label {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.sidebar-footer {
		margin-top: auto;
		padding: 0.75rem;
		text-align: center;
	}

	.version {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.main-content {
		flex: 1;
		padding: 2rem 2.5rem;
		overflow-y: auto;
	}
</style>
