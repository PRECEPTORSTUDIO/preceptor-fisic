<script lang="ts">
	import { page } from '$app/state';

	// Página de erro global — cobre (app), (public) e /a/[id].
	// Sem ela, 404/500 caíam na página default branca em inglês do SvelteKit.
	const MESSAGES: Record<number, { title: string; sub: string }> = {
		404: {
			title: 'Página não encontrada',
			sub: 'O link pode estar errado ou a página foi movida.'
		},
		403: {
			title: 'Acesso negado',
			sub: 'Você não tem permissão pra ver esta página.'
		},
		500: {
			title: 'Algo deu errado do nosso lado',
			sub: 'Já registramos o erro. Tenta de novo em instantes.'
		}
	};

	const msg = $derived(
		MESSAGES[page.status] ?? {
			title: page.error?.message || 'Erro inesperado',
			sub: 'Se persistir, volta pro início e tenta de novo.'
		}
	);
</script>

<svelte:head>
	<title>{page.status} · Preceptor Fisic</title>
</svelte:head>

<div class="err">
	<div class="err-glow"></div>
	<div class="err-logo">P</div>
	<div class="num err-status">{page.status}</div>
	<h1 class="err-title">{msg.title}</h1>
	<p class="err-sub">{msg.sub}</p>
	<a href="/" class="err-btn">Voltar pro início</a>
</div>

<style>
	.err {
		min-height: 100vh;
		background: var(--bg-0);
		color: var(--ink-0);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 32px 24px;
		position: relative;
		overflow: hidden;
	}
	.err-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -60%);
		width: 480px;
		height: 480px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
		opacity: 0.5;
		pointer-events: none;
	}
	.err-logo {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 19px var(--font-sans);
		box-shadow: var(--glow-accent);
		margin-bottom: 28px;
		position: relative;
	}
	.err-status {
		font: 500 64px/1 var(--font-mono);
		color: var(--accent);
		letter-spacing: -0.02em;
		position: relative;
	}
	.err-title {
		margin: 16px 0 0;
		font: 600 22px var(--font-sans);
		letter-spacing: -0.015em;
		position: relative;
	}
	.err-sub {
		margin: 8px 0 0;
		font: var(--body);
		color: var(--ink-2);
		max-width: 360px;
		position: relative;
	}
	.err-btn {
		margin-top: 28px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 42px;
		padding: 0 22px;
		border-radius: var(--r-pill);
		background: linear-gradient(180deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		font: 600 13.5px var(--font-sans);
		text-decoration: none;
		box-shadow: var(--glow-accent), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
		transition: transform 160ms var(--ease), box-shadow 160ms var(--ease);
		position: relative;
	}
	.err-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 0 28px rgba(167, 139, 250, 0.5), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
	}
</style>
