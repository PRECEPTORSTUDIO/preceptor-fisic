<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '../ui/avatar.svelte';
	import ThemeToggle from '../ui/theme-toggle.svelte';

	type Props = {
		userName?: string;
		userInitials?: string;
	};
	let { userName = 'Profissional', userInitials }: Props = $props();

	// Título derivado da rota — keeps mobile sem scroll lateral pesado
	const title = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/dashboard' || path === '/') return 'Visão geral';
		if (path.startsWith('/alunos/novo')) return 'Novo aluno';
		if (path.match(/^\/alunos\/[^/]+\/avaliacao/)) return 'Avaliação';
		if (path.match(/^\/alunos\/[^/]+\/editar/)) return 'Editar aluno';
		if (path.match(/^\/alunos\/[^/]+\/gerar/)) return 'Gerar plano';
		if (path.match(/^\/alunos\/[^/]+/)) return 'Aluno';
		if (path === '/alunos') return 'Alunos';
		if (path.match(/^\/planos\/[^/]+\/sessoes/)) return 'Sessão';
		if (path.match(/^\/planos\/[^/]+\/imprimir/)) return 'Imprimir plano';
		if (path.match(/^\/planos\/[^/]+/)) return 'Plano';
		if (path === '/planos') return 'Planos';
		if (path === '/exercicios') return 'Exercícios';
		if (path.match(/^\/exercicios\/novo/)) return 'Novo exercício';
		if (path.match(/^\/exercicios\/[^/]+\/editar/)) return 'Editar exercício';
		if (path === '/mensagens') return 'Mensagens';
		if (path === '/agenda') return 'Agenda';
		if (path.match(/^\/agenda\/nova/)) return 'Novo agendamento';
		if (path.match(/^\/agenda\/[^/]+/)) return 'Agendamento';
		if (path === '/configuracoes') return 'Configurações';
		if (path === '/feedback') return 'Feedback';
		if (path.startsWith('/crm')) return 'CRM';
		return 'Preceptor Fisic';
	});

	// Mostra back button em rotas detail (não em rotas top-level)
	const showBack = $derived.by(() => {
		const top = ['/dashboard', '/alunos', '/planos', '/exercicios', '/mensagens', '/agenda', '/configuracoes', '/feedback', '/crm'];
		return !top.includes(page.url.pathname);
	});

	function back() {
		if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
		}
	}
</script>

<header class="m-topbar">
	{#if showBack}
		<button
			type="button"
			class="m-topbar__back"
			onclick={back}
			aria-label="Voltar"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
		</button>
	{:else}
		<a class="m-topbar__brand" href="/dashboard" aria-label="Início">
			<div class="m-topbar__logo">P</div>
		</a>
	{/if}

	<div class="m-topbar__title" aria-current="page">{title}</div>

	<ThemeToggle />

	<a class="m-topbar__avatar" href="/configuracoes" aria-label="Configurações">
		<Avatar name={userName} size={28} />
	</a>
</header>

<style>
	.m-topbar {
		display: none;
		position: sticky;
		top: 0;
		z-index: 40;
		height: calc(54px + env(safe-area-inset-top, 0px));
		padding-top: env(safe-area-inset-top, 0px);
		background: var(--bg-glass);
		backdrop-filter: saturate(140%) blur(14px);
		-webkit-backdrop-filter: saturate(140%) blur(14px);
		border-bottom: 1px solid var(--ink-line);
		align-items: center;
		gap: 12px;
		padding-left: 14px;
		padding-right: 14px;
	}
	@media (max-width: 1023px) {
		.m-topbar {
			display: flex;
		}
	}

	.m-topbar__brand {
		text-decoration: none;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.m-topbar__logo {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 14px var(--font-sans);
		box-shadow: var(--glow-accent);
	}
	.m-topbar__back {
		all: unset;
		cursor: pointer;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-1);
		transition: background 140ms var(--ease);
	}
	.m-topbar__back:hover {
		background: var(--bg-2);
	}
	.m-topbar__title {
		flex: 1;
		font: 500 15px var(--font-sans);
		color: var(--ink-0);
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.m-topbar__avatar {
		flex-shrink: 0;
		text-decoration: none;
		display: block;
	}
</style>
