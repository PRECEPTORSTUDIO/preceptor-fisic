<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	let { children }: { children: Snippet } = $props();

	// Manifest PWA do aluno (start_url = link tokenizado) — substitui o
	// global de app.html, cujo start_url /dashboard mandava o aluno pro login.
	const token = $derived(page.url.searchParams.get('t'));
	const manifestHref = $derived(
		token ? `/a/${page.params.id}/manifest.webmanifest?t=${token}` : null
	);
</script>

<svelte:head>
	{#if manifestHref}
		<link rel="manifest" href={manifestHref} />
	{/if}
</svelte:head>

<div class="aluno-shell">
	<div class="aluno-frame">
		{@render children()}
	</div>
</div>

<style>
	.aluno-shell {
		min-height: 100vh;
		background: radial-gradient(ellipse at top, var(--bg-halo) 0%, var(--bg-0) 60%);
		display: flex;
		justify-content: center;
		align-items: stretch;
	}
	.aluno-frame {
		width: 100%;
		max-width: 480px;
		min-height: 100vh;
		background: var(--bg-0);
		color: var(--ink-0);
		font: var(--body);
		position: relative;
		display: flex;
		flex-direction: column;
		view-transition-name: aluno-content;
	}
	/* Tablet + desktop — coluna centralizada com moldura.
	   O app do aluno é pessoal/mobile-first; no PC fica uma coluna focada
	   e centralizada (padrão "app no desktop"), não um dashboard esticado.
	   Topo arredondado + fundo reto (encosta na tab bar fixa, sem flutuar). */
	@media (min-width: 600px) {
		.aluno-shell {
			padding: 28px 20px 0;
			align-items: flex-start;
		}
		.aluno-frame {
			max-width: 460px;
			min-height: calc(100vh - 28px);
			border: 1px solid var(--ink-line);
			border-bottom: 0;
			border-radius: var(--r-4) var(--r-4) 0 0;
			box-shadow: var(--shadow-pop);
		}
	}
</style>
