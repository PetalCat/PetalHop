<script lang="ts">
	let code = $state('');
	let loading = $state(false);
	let error = $state('');

	async function verifyCode() {
		if (!code || code.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Verification failed';
				loading = false;
				return;
			}

			// Redirect to dashboard
			window.location.href = '/';
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
			loading = false;
		}
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Only allow digits
		input.value = input.value.replace(/\D/g, '').slice(0, 6);
		code = input.value;
	}
</script>

<svelte:head>
	<title>MFA Verification - PetalHop</title>
</svelte:head>

<div class="mfa-container">
	<div class="mfa-card">
		<div class="icon">🔐</div>

		<h1>Two-Factor Authentication</h1>
		<p class="subtitle">Enter the 6-digit code from your authenticator app</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				verifyCode();
			}}
		>
			<div class="code-input-wrapper">
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="6"
					placeholder="000000"
					value={code}
					oninput={handleInput}
					class="code-input"
					autocomplete="one-time-code"
				/>
			</div>

			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<button
				class="btn btn-primary btn-full"
				type="submit"
				disabled={loading || code.length !== 6}
			>
				{loading ? 'Verifying...' : 'Verify'}
			</button>
		</form>

		<div class="help-text">
			<p>
				Open your authenticator app (Google Authenticator, Authy, etc.) and enter the current code.
			</p>
		</div>
	</div>
</div>

<style>
	.mfa-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: 1rem;
	}

	.mfa-card {
		width: 100%;
		max-width: 400px;
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-lg);
		text-align: center;
	}

	.icon {
		font-size: 3rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
	}

	.subtitle {
		color: var(--color-text-muted);
		margin: 0 0 2rem 0;
		font-size: 0.875rem;
	}

	.code-input-wrapper {
		margin-bottom: 1.5rem;
	}

	.code-input {
		text-align: center;
		font-size: 2rem;
		font-family: 'JetBrains Mono', monospace;
		letter-spacing: 0.5em;
		padding: 1rem;
	}

	.error-message {
		background: oklch(0.65 0.2 25 / 0.15);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.btn-full {
		width: 100%;
		padding: 0.875rem;
		font-size: 1rem;
	}

	.help-text {
		margin-top: 1.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.help-text p {
		margin: 0;
	}
</style>
