<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from '$lib/components/ui/theme-toggle.svelte';
	import { Avatar } from '$lib/components/ui';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	const name = $derived(data.professional?.name ?? '');

	const NAV = [
		{ href: '/crm', label: 'Visão geral', exact: true },
		{ href: '/crm/leads', label: 'Leads', exact: false },
		{ href: '/crm/feedbacks', label: 'Feedbacks', exact: false }
	];
	const isActive = (href: string, exact: boolean) =>
		exact
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	// /crm/[id] e /crm/novo contam como "Leads"
	const leadsActive = $derived(
		/^\/crm\/(leads|novo|[0-9a-f-]{36})/.test(page.url.pathname)
	);
</script>

<div class="crm-shell">
	<!-- Topbar do CRM: marca própria, navegação por abas, tema no canto direito -->
	<header class="crm-top">
		<a href="/crm" class="crm-brand">
			<div class="crm-logo">P</div>
			<div>
				<div class="crm-brand-name">PreceptorFISIC</div>
				<div class="crm-brand-sub">CRM · admin</div>
			</div>
		</a>

		<nav class="crm-nav" aria-label="Navegação do CRM">
			{#each NAV as item (item.href)}
				{@const on =
					item.href === '/crm/leads' ? leadsActive : isActive(item.href, item.exact)}
				<a href={item.href} class="crm-nav-item" class:on>{item.label}</a>
			{/each}
		</nav>

		<div class="crm-top-right">
			<a href="/dashboard" class="crm-back">← Voltar ao app</a>
			<ThemeToggle />
			<Avatar {name} size={30} />
		</div>
	</header>

	<main class="crm-main">
		{@render children()}
	</main>
</div>

<style>
	.crm-shell {
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--bg-0);
		display: flex;
		flex-direction: column;
	}
	.crm-top {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 12px 24px;
		background: color-mix(in srgb, var(--bg-0) 82%, transparent);
		backdrop-filter: saturate(140%) blur(14px);
		-webkit-backdrop-filter: saturate(140%) blur(14px);
		border-bottom: 1px solid var(--ink-line);
	}
	.crm-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		flex-shrink: 0;
	}
	.crm-logo {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		color: #0a0a0a;
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 15px var(--font-sans);
	}
	.crm-brand-name {
		font: 600 13.5px var(--font-sans);
		color: var(--ink-0);
		letter-spacing: -0.01em;
	}
	.crm-brand-sub {
		font: 500 9.5px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.crm-nav {
		display: flex;
		gap: 4px;
		flex: 1;
	}
	.crm-nav-item {
		padding: 7px 14px;
		border-radius: var(--r-pill);
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
		text-decoration: none;
		transition: all 140ms var(--ease);
	}
	.crm-nav-item:hover {
		color: var(--ink-0);
		background: var(--bg-2);
	}
	.crm-nav-item.on {
		color: var(--accent-2);
		background: var(--accent-wash, rgba(167, 139, 250, 0.1));
	}
	.crm-top-right {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}
	.crm-back {
		font: 500 12.5px var(--font-sans);
		color: var(--ink-2);
		text-decoration: none;
		transition: color 140ms var(--ease);
	}
	.crm-back:hover {
		color: var(--ink-0);
	}
	.crm-main {
		flex: 1;
		width: 100%;
	}

	@media (max-width: 767px) {
		.crm-top {
			padding: 10px 14px;
			gap: 12px;
			flex-wrap: wrap;
		}
		.crm-nav {
			order: 3;
			width: 100%;
			overflow-x: auto;
		}
		.crm-back {
			display: none;
		}
	}
</style>
