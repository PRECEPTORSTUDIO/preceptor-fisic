<script lang="ts">
	import { page } from '$app/state';
	import NavIcon from './nav-icon.svelte';

	type Props = {
		onMore: () => void;
	};
	let { onMore }: Props = $props();

	type TabItem = {
		id: string;
		label: string;
		icon: 'home' | 'alunos' | 'planos' | 'agenda' | 'msgs';
		href: string;
	};

	const TABS: TabItem[] = [
		{ id: 'home', label: 'Visão', icon: 'home', href: '/dashboard' },
		{ id: 'alunos', label: 'Alunos', icon: 'alunos', href: '/alunos' },
		{ id: 'planos', label: 'Planos', icon: 'planos', href: '/planos' },
		{ id: 'agenda', label: 'Agenda', icon: 'agenda', href: '/agenda' }
	];

	const isActive = (href: string) => {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard' || path === '/';
		return path.startsWith(href);
	};

	const moreActive = $derived.by(() => {
		const path = page.url.pathname;
		const otherRoutes = ['/exercicios', '/mensagens', '/configuracoes', '/feedback', '/crm'];
		return otherRoutes.some((r) => path.startsWith(r));
	});
</script>

<nav class="m-tabbar" aria-label="Navegação principal">
	<div class="m-tabbar__inner">
		{#each TABS as t (t.id)}
			{@const on = isActive(t.href)}
			<a class="m-tab" class:on href={t.href} aria-current={on ? 'page' : undefined}>
				<span class="m-tab__icon" class:on>
					<NavIcon name={t.icon} size={20} />
				</span>
				<span class="m-tab__label">{t.label}</span>
				{#if on}<span class="m-tab__indicator"></span>{/if}
			</a>
		{/each}
		<button
			type="button"
			class="m-tab"
			class:on={moreActive}
			onclick={onMore}
			aria-label="Mais opções"
		>
			<span class="m-tab__icon" class:on={moreActive}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="5" cy="12" r="1.6" />
					<circle cx="12" cy="12" r="1.6" />
					<circle cx="19" cy="12" r="1.6" />
				</svg>
			</span>
			<span class="m-tab__label">Mais</span>
			{#if moreActive}<span class="m-tab__indicator"></span>{/if}
		</button>
	</div>
</nav>

<style>
	.m-tabbar {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background: var(--bg-glass-strong);
		backdrop-filter: saturate(140%) blur(16px);
		-webkit-backdrop-filter: saturate(140%) blur(16px);
		border-top: 1px solid var(--ink-line);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	@media (max-width: 1023px) {
		.m-tabbar {
			display: block;
		}
	}

	.m-tabbar__inner {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		max-width: 600px;
		margin: 0 auto;
	}
	.m-tab {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 10px 6px 12px;
		text-decoration: none;
		color: var(--ink-2);
		font: 500 10px var(--font-sans);
		letter-spacing: -0.005em;
		position: relative;
		transition: color 140ms var(--ease);
	}
	.m-tab:hover,
	.m-tab.on {
		color: var(--accent-2);
	}
	.m-tab__icon {
		color: var(--ink-2);
		display: flex;
		transition: color 140ms var(--ease);
	}
	.m-tab__icon.on {
		color: var(--accent);
	}
	.m-tab__label {
		font-size: 10px;
	}
	.m-tab__indicator {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 28px;
		height: 2px;
		background: var(--accent);
		border-radius: 0 0 2px 2px;
		box-shadow: 0 0 8px var(--accent-glow);
	}
</style>
