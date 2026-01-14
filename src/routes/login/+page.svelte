<script lang="ts">
	let email = $state('');
	let password = $state('');
	let isSignup = $state(false);
	let loading = $state(false);
	let error = $state('');

	async function handleSubmit() {
		if (!email || !password) {
			error = 'Email and password are required';
			return;
		}

		loading = true;
		error = '';

		try {
			const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Authentication failed';
				loading = false;
				return;
			}

			if (data.mfaRequired) {
				// Redirect to MFA verification
				window.location.href = '/login/mfa';
			} else {
				// Redirect to dashboard
				window.location.href = '/';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{isSignup ? 'Sign Up' : 'Login'} - PetalHop</title>
</svelte:head>

<div class="login-container">
	<div class="login-card">
		<div class="logo">
			<span class="logo-icon">🌸</span>
			<span class="logo-text">PetalHop</span>
		</div>

		<h1>{isSignup ? 'Create Account' : 'Welcome Back'}</h1>
		<p class="subtitle">
			{isSignup ? 'Set up your admin account' : 'Sign in to manage your WireGuard ingress'}
		</p>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<div class="form-group">
				<label for="email">Email</label>
				<input
					id="email"
					type="email"
					placeholder="admin@example.com"
					bind:value={email}
					autocomplete="email"
				/>
			</div>

			<div class="form-group">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					placeholder="••••••••"
					bind:value={password}
					autocomplete={isSignup ? 'new-password' : 'current-password'}
				/>
			</div>

			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<button class="btn btn-primary btn-full" type="submit" disabled={loading}>
				{loading ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
			</button>
		</form>

		<div class="toggle-mode">
			{#if isSignup}
				Already have an account?
				<button class="link-btn" onclick={() => (isSignup = false)}>Sign in</button>
			{:else}
				Don't have an account?
				<button class="link-btn" onclick={() => (isSignup = true)}>Sign up</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.login-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: 1rem;
	}

	.login-card {
		width: 100%;
		max-width: 400px;
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-lg);
	}

	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.logo-icon {
		font-size: 2rem;
	}

	.logo-text {
		font-size: 1.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-primary) 0%, oklch(0.8 0.15 300) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	h1 {
		text-align: center;
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
	}

	.subtitle {
		text-align: center;
		color: var(--color-text-muted);
		margin: 0 0 2rem 0;
		font-size: 0.875rem;
	}

	.form-group {
		margin-bottom: 1.25rem;
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

	.toggle-mode {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		cursor: pointer;
		font-size: 0.875rem;
		padding: 0;
		text-decoration: underline;
	}

	.link-btn:hover {
		color: var(--color-primary-hover);
	}
</style>
