<script lang="ts">
	import { Sidebar, MobileTopbar, MobileTabbar, MobileMoreSheet } from '$lib/components/layout';
	import { page } from '$app/state';
	import ThemeToggle from '$lib/components/ui/theme-toggle.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	const userName = $derived(data.professional?.name ?? 'Visitante');
	const userCref = $derived(data.professional?.cref ?? 'modo design');
	const studentsCount = $derived(data.sidebarCounts?.students ?? 0);
	const unreadMessages = $derived(data.sidebarCounts?.unreadMessages ?? 0);
	const newLeadsCount = $derived(data.sidebarCounts?.newLeads ?? 0);
	const isAdmin = $derived(data.professional?.isAdmin ?? false);

	let moreOpen = $state(false);
</script>

<svelte:head>
	<!-- Manifest do app do PROFISSIONAL (start_url /dashboard). Fica aqui, e
	     não no app.html, porque o app do ALUNO (/a/[id]) serve um manifest
	     dinâmico próprio — o navegador usa o primeiro link que encontrar. -->
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

<div class="app-shell">
	<!-- Sidebar — desktop only -->
	<Sidebar {userName} {userCref} {studentsCount} {unreadMessages} {newLeadsCount} {isAdmin} />

	<!-- Conteúdo: topbar mobile + main + tabbar mobile -->
	<div class="app-stack">
		<MobileTopbar {userName} />

		<!-- Tema no canto superior direito — desktop only (o topbar mobile já tem o dele) -->
		<div class="theme-corner">
			<ThemeToggle />
		</div>

		<main class="pf-main">
			<!-- {#key pathname} remonta o conteúdo a cada troca de rota, re-disparando
			     a animação CSS de entrada. Substituto leve das View Transitions
			     (removidas — congelavam a main thread; ver +layout.svelte raiz). -->
			{#key page.url.pathname}
				<div class="page-enter">
					{@render children()}
				</div>
			{/key}
		</main>

		<MobileTabbar onMore={() => (moreOpen = true)} />
	</div>

	<!-- Sheet "mais" mobile (overlay) -->
	<MobileMoreSheet
		open={moreOpen}
		onClose={() => (moreOpen = false)}
		{userName}
		{userCref}
		{isAdmin}
	/>
</div>

<style>
	.app-shell {
		display: flex;
		/* height fixo (não min-height) — trava o shell na viewport pra que
		   só .pf-main role, mantendo o sidebar fixo. Antes, com min-height,
		   o shell crescia com o conteúdo e o body inteiro rolava, levando
		   o sidebar junto. */
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--bg-0);
	}
	.app-stack {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.pf-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
	}
	.page-enter {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		animation: pf-fade-up var(--dur-2) var(--ease) both;
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
	/* Toggle de tema fixo no canto superior direito (desktop). O .app-stack é
	   o containing block (position:relative) — o botão flutua sobre o main
	   sem empurrar layout. Mobile usa o toggle do topbar. */
	.app-stack {
		position: relative;
	}
	.theme-corner {
		position: absolute;
		top: 14px;
		right: 20px;
		z-index: 30;
	}
	@media (max-width: 1023px) {
		.theme-corner {
			display: none;
		}
	}
</style>
