<script lang="ts">
	import { Sidebar, MobileTopbar, MobileTabbar, MobileMoreSheet } from '$lib/components/layout';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	const userName = $derived(data.professional?.name ?? 'Visitante');
	const userCref = $derived(data.professional?.cref ?? 'modo design');
	const studentsCount = $derived(data.sidebarCounts?.students ?? 0);
	const unreadMessages = $derived(data.sidebarCounts?.unreadMessages ?? 0);

	let moreOpen = $state(false);
</script>

<div class="app-shell">
	<!-- Sidebar — desktop only -->
	<Sidebar {userName} {userCref} {studentsCount} {unreadMessages} />

	<!-- Conteúdo: topbar mobile + main + tabbar mobile -->
	<div class="app-stack">
		<MobileTopbar {userName} />

		<main class="pf-main">
			{@render children()}
		</main>

		<MobileTabbar onMore={() => (moreOpen = true)} />
	</div>

	<!-- Sheet "mais" mobile (overlay) -->
	<MobileMoreSheet
		open={moreOpen}
		onClose={() => (moreOpen = false)}
		{userName}
		{userCref}
	/>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
		background: var(--bg-0);
	}
	.app-stack {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.pf-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		view-transition-name: page-content;
	}
	@media (max-width: 1023px) {
		.pf-main {
			/* Espaço pro tab bar fixo (60px + safe-area) */
			padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
		}
	}
	/* Esconde sidebar inteira em mobile */
	@media (max-width: 1023px) {
		.app-shell :global(.pf-sidebar) {
			display: none;
		}
	}
</style>
