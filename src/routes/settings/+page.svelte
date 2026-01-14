<script lang="ts">
	import { onMount } from 'svelte';
	import { showConfirm, showToast } from '$lib/components/Notifications.svelte';

	interface UserData {
		email: string;
		isAdmin: boolean;
		mfaEnabled: boolean;
	}

	let user = $state<UserData | null>(null);
	let signupsEnabled = $state(true);
	let mfaRequired = $state(false);
	let controllerUrlInput = $state('');
	let serverPublicKeyInput = $state('');
	let serverEndpointInput = $state('');
	let matrixWebhookInput = $state('');
	let loading = $state(true);
	let error = $state('');

	// MFA Setup state
	let showMfaSetup = $state(false);
	let mfaSecret = $state('');
	let mfaQrCode = $state('');
	let verifyCode = $state('');
	let mfaError = $state('');
	let mfaLoading = $state(false);

	// WireGuard Status
	let wgStatus = $state('checking');
	let wgPeerCount = $state(0);

	onMount(async () => {
		await loadSettings();
		await fetchWgStatus();
	});

	async function fetchWgStatus() {
		try {
			const res = await fetch('/api/settings/wg-status');
			if (res.ok) {
				const data = await res.json();
				wgStatus = data.status;
				wgPeerCount = data.peerCount || 0;
			} else {
				wgStatus = 'error';
			}
		} catch (e) {
			wgStatus = 'error';
		}
	}

	async function loadSettings() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/auth/me');
			if (res.ok) {
				const data = await res.json();
				user = data.user;
				signupsEnabled = data.signupsEnabled ?? true;
				mfaRequired = data.mfaRequired ?? false;
				controllerUrlInput = data.controllerUrl || window.location.origin;
				serverPublicKeyInput = data.serverPublicKey || '';
				serverEndpointInput = data.serverEndpoint || '';
				matrixWebhookInput = data.matrixWebhookUrl || '';
			} else {
				if (res.status === 401) {
					window.location.href = '/login';
					return;
				}
				if (res.status === 403) {
					// MFA Required
					const data = await res.json();
					if (data.error === 'MFA required') {
						window.location.href = '/login/mfa';
						return;
					}
				}
				error = 'Failed to load settings';
			}
		} catch (e) {
			console.error('Failed to load settings:', e);
			error = 'Failed to load settings';
		}
		loading = false;
	}

	// ...

	async function saveControllerUrl() {
		if (!controllerUrlInput) return;
		await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ controllerUrl: controllerUrlInput })
		});
		showToast('Controller URL saved', 'success');
	}

	async function detectServerKey() {
		try {
			const res = await fetch('/api/settings/detect-key', { method: 'POST' });
			const data = await res.json();
			if (res.ok && data.publicKey) {
				serverPublicKeyInput = data.publicKey;
				showToast('Public Key detected!', 'success');
				saveServerConfig();
			} else {
				showToast(data.error || 'Failed to detect key', 'error');
			}
		} catch (e) {
			showToast('Failed to detect key', 'error');
		}
	}

	async function saveServerConfig() {
		await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				serverPublicKey: serverPublicKeyInput,
				serverEndpoint: serverEndpointInput
			})
		});
		showToast('Server config saved', 'success');
	}

	async function saveMatrixWebhook() {
		await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ matrixWebhookUrl: matrixWebhookInput })
		});
		showToast('Webhook URL saved', 'success');
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}

	async function toggleSignups() {
		const res = await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ signupsEnabled: !signupsEnabled })
		});
		if (res.ok) {
			signupsEnabled = !signupsEnabled;
		}
	}

	async function toggleMfaRequired() {
		const res = await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mfaRequired: !mfaRequired })
		});
		if (res.ok) {
			mfaRequired = !mfaRequired;
		}
	}

	async function setupMfa() {
		mfaLoading = true;
		mfaError = '';
		try {
			const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
			const data = await res.json();
			if (res.ok) {
				mfaSecret = data.secret;
				mfaQrCode = data.qrCode;
				showMfaSetup = true;
			} else {
				mfaError = data.error;
			}
		} catch (e) {
			mfaError = 'Failed to setup MFA';
		}
		mfaLoading = false;
	}

	async function verifyMfa() {
		if (verifyCode.length !== 6) {
			mfaError = 'Enter a 6-digit code';
			return;
		}
		mfaLoading = true;
		mfaError = '';
		try {
			const res = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: verifyCode })
			});
			const data = await res.json();
			if (res.ok) {
				showMfaSetup = false;
				if (user) user.mfaEnabled = true;
				verifyCode = '';
				mfaSecret = '';
				mfaQrCode = '';
			} else {
				mfaError = data.error;
			}
		} catch (e) {
			mfaError = 'Verification failed';
		}
		mfaLoading = false;
	}

	// ...

	async function disableMfa() {
		const confirmed = await showConfirm({
			title: 'Disable MFA',
			message:
				'Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.',
			confirmLabel: 'Disable',
			isDanger: true
		});

		if (!confirmed) return;
		const res = await fetch('/api/auth/mfa/setup', { method: 'DELETE' });
		if (res.ok && user) {
			user.mfaEnabled = false;
		}
	}
</script>

<svelte:head>
	<title>Settings - PetalHop</title>
</svelte:head>

<div class="animate-in">
	<div class="header mb-6 flex items-center justify-between">
		<h1>Settings</h1>
		<button class="btn btn-ghost" onclick={logout}>🚪 Logout</button>
	</div>

	{#if loading}
		<p class="text-muted">Loading...</p>
	{:else if error}
		<div class="card p-6 text-center">
			<p class="text-danger mb-4">{error}</p>
			<button class="btn btn-primary" onclick={loadSettings}>Retry</button>
		</div>
	{:else if user}
		<div class="settings-grid">
			<!-- Account Section -->
			<div class="card">
				<h2>Account</h2>
				<div class="setting-item">
					<div class="setting-info">
						<span class="setting-label">Email</span>
						<span class="setting-value">{user.email}</span>
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-info">
						<span class="setting-label">Role</span>
						<span class="setting-value">{user.isAdmin ? '👑 Admin' : 'User'}</span>
					</div>
				</div>
			</div>

			<!-- MFA Section -->
			<div class="card">
				<h2>Two-Factor Authentication</h2>
				{#if showMfaSetup}
					<div class="mfa-setup">
						<p class="text-muted mb-4 text-sm">
							Scan this QR code with your authenticator app, then enter the code to verify.
						</p>
						<div class="qr-placeholder">
							<img src={mfaQrCode} alt="MFA QR Code" class="qr-code" />
						</div>
						<div class="secret-display">
							<span class="text-muted text-sm">Manual entry:</span>
							<code>{mfaSecret}</code>
						</div>
						<div class="verify-input mt-4">
							<input
								type="text"
								placeholder="Enter 6-digit code"
								bind:value={verifyCode}
								maxlength="6"
							/>
							<button class="btn btn-primary" onclick={verifyMfa} disabled={mfaLoading}>
								{mfaLoading ? 'Verifying...' : 'Verify & Enable'}
							</button>
						</div>
						{#if mfaError}
							<p class="error-text mt-2">{mfaError}</p>
						{/if}
						<button class="btn btn-ghost btn-sm mt-4" onclick={() => (showMfaSetup = false)}>
							Cancel
						</button>
					</div>
				{:else}
					<div class="setting-item">
						<div class="setting-info">
							<span class="setting-label">Status</span>
							<span class="setting-value">
								{user.mfaEnabled ? '✅ Enabled' : '❌ Disabled'}
							</span>
						</div>
						{#if user.mfaEnabled}
							<button class="btn btn-danger btn-sm" onclick={disableMfa}>Disable</button>
						{:else}
							<button class="btn btn-primary btn-sm" onclick={setupMfa} disabled={mfaLoading}>
								{mfaLoading ? 'Setting up...' : 'Enable MFA'}
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Admin Section -->
			{#if user.isAdmin}
				<div class="card">
					<h2>Admin Settings</h2>
					<div class="setting-item">
						<div class="setting-info">
							<span class="setting-label">Allow Signups</span>
							<span class="setting-description">Allow new users to register</span>
						</div>
						<button class="toggle-btn" class:active={signupsEnabled} onclick={toggleSignups}>
							{signupsEnabled ? 'ON' : 'OFF'}
						</button>
					</div>
					<div class="setting-item">
						<div class="setting-info">
							<span class="setting-label">Require MFA</span>
							<span class="setting-description">Force all users to enable MFA</span>
						</div>
						<button class="toggle-btn" class:active={mfaRequired} onclick={toggleMfaRequired}>
							{mfaRequired ? 'ON' : 'OFF'}
						</button>
					</div>

					<div class="setting-item-col">
						<div class="setting-info">
							<span class="setting-label">Controller URL</span>
							<span class="setting-description">Base URL for agent setup commands</span>
						</div>
						<div class="url-input-group">
							<input
								type="text"
								placeholder="https://petalhops.example.com"
								bind:value={controllerUrlInput}
								onblur={saveControllerUrl}
							/>
							<button class="btn btn-sm btn-ghost" onclick={saveControllerUrl}>Save</button>
						</div>
					</div>

					<div class="setting-item-col">
						<div class="setting-info">
							<span class="setting-label flex items-center gap-2">
								Server WireGuard Configuration
								{#if wgStatus === 'up'}
									<span class="badge badge-success">UP ({wgPeerCount} peers)</span>
								{:else if wgStatus === 'down'}
									<span class="badge badge-danger">DOWN</span>
								{:else if wgStatus === 'checking'}
									<span class="badge badge-warning">Checking...</span>
								{/if}
							</span>
							<span class="setting-description">
								Helper configuration sent to agents to auto-connect.
							</span>
						</div>
						<div class="config-inputs">
							<div class="form-group">
								<label for="serverPub">Server Public Key</label>
								<div class="input-with-action">
									<input
										id="serverPub"
										type="text"
										placeholder="Base64 Public Key"
										bind:value={serverPublicKeyInput}
										onblur={saveServerConfig}
									/>
									<button
										class="btn btn-sm btn-secondary"
										onclick={detectServerKey}
										title="Auto-detect from server"
									>
										Detect
									</button>
								</div>
							</div>
							<div class="form-group">
								<label for="serverEnd">Server Endpoint (IP:Port)</label>
								<input
									id="serverEnd"
									type="text"
									placeholder="1.2.3.4:51820"
									bind:value={serverEndpointInput}
									onblur={saveServerConfig}
								/>
							</div>
							<button class="btn btn-sm btn-ghost self-end" onclick={saveServerConfig}>
								Save
							</button>
						</div>
					</div>
				</div>

				<!-- Notifications Section -->
				<div class="card mt-6">
					<h2>Notifications</h2>
					<div class="setting-item-col">
						<div class="setting-info">
							<span class="setting-label">Matrix Webhook URL</span>
							<span class="setting-description">
								Send alerts to Matrix/Element when agents go offline.
							</span>
						</div>
						<div class="url-input-group">
							<input
								type="text"
								placeholder="https://matrix.example.com/_matrix/..."
								bind:value={matrixWebhookInput}
								onblur={saveMatrixWebhook}
							/>
							<button class="btn btn-sm btn-ghost" onclick={saveMatrixWebhook}> Save </button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 600px;
	}

	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.setting-item:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.setting-label {
		font-weight: 500;
	}

	.setting-value {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.setting-description {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.toggle-btn {
		padding: 0.375rem 0.875rem;
		border-radius: 9999px;
		border: 1px solid var(--color-border);
		background: var(--color-bg-input);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-btn.active {
		background: var(--color-success);
		border-color: var(--color-success);
		color: white;
	}

	.mfa-setup {
		padding-top: 1rem;
	}

	.qr-placeholder {
		display: flex;
		justify-content: center;
		margin: 1rem 0;
	}

	.qr-code {
		border-radius: var(--radius-md);
		border: 4px solid white;
	}

	.secret-display {
		text-align: center;
		margin: 1rem 0;
	}

	.secret-display code {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.875rem;
		word-break: break-all;
	}

	.verify-input {
		display: flex;
		gap: 0.75rem;
	}

	.verify-input input {
		flex: 1;
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
		letter-spacing: 0.2em;
	}

	.error-text {
		color: var(--color-danger);
		font-size: 0.875rem;
	}

	.setting-item-col {
		padding: 1rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.setting-item-col:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.url-input-group {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.url-input-group input {
		flex: 1;
	}

	.config-inputs {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}

	.self-end {
		align-self: flex-end;
	}

	.input-with-action {
		display: flex;
		gap: 0.5rem;
	}

	.input-with-action input {
		flex: 1;
	}
</style>
