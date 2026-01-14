<script lang="ts" module>
	// Toast store
	type ToastType = 'success' | 'error' | 'info' | 'warning';

	interface Toast {
		id: string;
		message: string;
		type: ToastType;
	}

	let toasts = $state<Toast[]>([]);

	export function showToast(message: string, type: ToastType = 'info') {
		const id = crypto.randomUUID();
		toasts.push({ id, message, type });

		// Auto-dismiss after 4 seconds
		setTimeout(() => {
			dismissToast(id);
		}, 4000);
	}

	export function dismissToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	// Confirm modal store
	interface ConfirmState {
		isOpen: boolean;
		title: string;
		message: string;
		confirmLabel: string;
		cancelLabel: string;
		onConfirm: () => void;
		onCancel: () => void;
		isDanger: boolean;
	}

	let confirmState = $state<ConfirmState>({
		isOpen: false,
		title: '',
		message: '',
		confirmLabel: 'Confirm',
		cancelLabel: 'Cancel',
		onConfirm: () => {},
		onCancel: () => {},
		isDanger: false
	});

	export function showConfirm(options: {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		isDanger?: boolean;
	}): Promise<boolean> {
		return new Promise((resolve) => {
			confirmState = {
				isOpen: true,
				title: options.title,
				message: options.message,
				confirmLabel: options.confirmLabel || 'Confirm',
				cancelLabel: options.cancelLabel || 'Cancel',
				isDanger: options.isDanger ?? false,
				onConfirm: () => {
					confirmState.isOpen = false;
					resolve(true);
				},
				onCancel: () => {
					confirmState.isOpen = false;
					resolve(false);
				}
			};
		});
	}
</script>

<script lang="ts">
	// This component renders both toasts and the confirm modal
</script>

<!-- Toast Container -->
<div class="toast-container">
	{#each toasts as toast (toast.id)}
		<div class="toast toast-{toast.type}" role="alert">
			<span class="toast-icon">
				{#if toast.type === 'success'}✓
				{:else if toast.type === 'error'}✕
				{:else if toast.type === 'warning'}⚠
				{:else}ℹ{/if}
			</span>
			<span class="toast-message">{toast.message}</span>
			<button class="toast-close" onclick={() => dismissToast(toast.id)}>×</button>
		</div>
	{/each}
</div>

<!-- Confirm Modal -->
{#if confirmState.isOpen}
	<div
		class="modal-overlay"
		onclick={confirmState.onCancel}
		onkeydown={(e) => e.key === 'Escape' && confirmState.onCancel()}
		role="presentation"
		tabindex="-1"
	>
		<div
			class="modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<h3 class="modal-title">{confirmState.title}</h3>
			<p class="modal-message">{confirmState.message}</p>
			<div class="modal-actions">
				<button class="btn btn-ghost" onclick={confirmState.onCancel}>
					{confirmState.cancelLabel}
				</button>
				<button
					class="btn {confirmState.isDanger ? 'btn-danger' : 'btn-primary'}"
					onclick={confirmState.onConfirm}
				>
					{confirmState.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Toast styles */
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		z-index: 1000;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		pointer-events: auto;
		animation: slideIn 0.2s ease-out;
		max-width: 400px;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(1rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.toast-success {
		border-left: 3px solid var(--color-success);
	}

	.toast-error {
		border-left: 3px solid var(--color-danger);
	}

	.toast-warning {
		border-left: 3px solid var(--color-warning);
	}

	.toast-info {
		border-left: 3px solid var(--color-primary);
	}

	.toast-icon {
		font-weight: bold;
		font-size: 1rem;
	}

	.toast-success .toast-icon {
		color: var(--color-success);
	}

	.toast-error .toast-icon {
		color: var(--color-danger);
	}

	.toast-warning .toast-icon {
		color: var(--color-warning);
	}

	.toast-info .toast-icon {
		color: var(--color-primary);
	}

	.toast-message {
		flex: 1;
		font-size: 0.875rem;
	}

	.toast-close {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0;
		line-height: 1;
	}

	.toast-close:hover {
		color: var(--color-text);
	}

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: oklch(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal {
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		max-width: 400px;
		width: 90%;
		box-shadow: var(--shadow-lg);
		animation: scaleIn 0.15s ease-out;
	}

	@keyframes scaleIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.modal-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
	}

	.modal-message {
		margin: 0 0 1.5rem 0;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}
</style>
