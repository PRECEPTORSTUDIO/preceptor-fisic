<script lang="ts">
	import { theme } from '$lib/theme.svelte';

	type Props = {
		/** 'nav' segue o padrão dos itens da sidebar; 'icon' é compacto pros topbars. */
		variant?: 'nav' | 'icon';
	};
	let { variant = 'icon' }: Props = $props();

	const isDark = $derived(theme.resolved === 'dark');
	const label = $derived(isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
</script>

{#snippet icon()}
	{#if isDark}
		<!-- Sol: clicar leva ao claro -->
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		</svg>
	{:else}
		<!-- Lua: clicar leva ao escuro -->
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
		</svg>
	{/if}
{/snippet}

{#if variant === 'nav'}
	<button class="pf-navitem" type="button" style="width:100%" onclick={() => theme.toggle()} aria-label={label}>
		<span class="pf-navitem__indicator"></span>
		<span class="pf-navitem__icon">{@render icon()}</span>
		<span style="flex:1">{isDark ? 'Tema claro' : 'Tema escuro'}</span>
	</button>
{:else}
	<button class="tt" type="button" onclick={() => theme.toggle()} aria-label={label} title={label}>
		{@render icon()}
	</button>
{/if}

<style>
	.tt {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--r-2);
		border: 1px solid var(--ink-line);
		background: var(--bg-2);
		color: var(--ink-1);
		cursor: pointer;
		transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
	}
	.tt:hover {
		background: var(--bg-3);
		color: var(--ink-0);
	}
	.tt:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
