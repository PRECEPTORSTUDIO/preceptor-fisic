<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';
	type Props = {
		variant?: Variant;
		size?: Size;
		children?: Snippet;
		icon?: Snippet;
		style?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		title?: string;
		onclick?: (e: MouseEvent) => void;
	};

	let {
		variant = 'primary',
		size = 'md',
		children,
		icon,
		style = '',
		type = 'button',
		disabled = false,
		title,
		onclick
	}: Props = $props();

	let hover = $state(false);
</script>

<button
	{type}
	{disabled}
	{title}
	class="pf-btn pf-btn--{variant} pf-btn--{size}"
	class:is-hover={hover}
	{style}
	onmouseenter={() => (hover = true)}
	onmouseleave={() => (hover = false)}
	{onclick}
>
	{#if icon}{@render icon()}{/if}
	{@render children?.()}
</button>

<style>
	.pf-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-sans);
		font-weight: 500;
		letter-spacing: -0.005em;
		cursor: pointer;
		transition: all 140ms var(--ease);
		border: 1px solid transparent;
	}
	.pf-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.pf-btn--sm {
		height: 32px;
		padding: 0 12px;
		font-size: 12px;
		border-radius: var(--r-1);
	}
	.pf-btn--md {
		height: 40px;
		padding: 0 18px;
		font-size: 14px;
		border-radius: var(--r-2);
	}
	.pf-btn--lg {
		height: 48px;
		padding: 0 24px;
		font-size: 15px;
		border-radius: var(--r-2);
	}

	.pf-btn--primary {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
	}
	.pf-btn--primary.is-hover:not(:disabled) {
		background: var(--accent-2);
		border-color: var(--accent-2);
		box-shadow: var(--glow-accent);
	}

	.pf-btn--secondary {
		background: var(--bg-3);
		color: var(--ink-0);
		border-color: var(--ink-line-2);
	}
	.pf-btn--secondary.is-hover:not(:disabled) {
		background: var(--bg-4);
		border-color: var(--ink-2);
	}

	.pf-btn--ghost {
		background: transparent;
		color: var(--ink-1);
	}
	.pf-btn--ghost.is-hover:not(:disabled) {
		background: var(--bg-3);
		color: var(--ink-0);
	}

	.pf-btn--danger {
		background: transparent;
		color: var(--danger);
		border-color: var(--danger);
	}
	.pf-btn--danger.is-hover:not(:disabled) {
		background: var(--danger-dim);
	}
</style>
