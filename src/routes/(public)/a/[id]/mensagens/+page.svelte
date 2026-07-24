<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { onMount, onDestroy, tick } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const studentId = $derived(page.params.id);
	const tokenParam = $derived(page.url.searchParams.get('t'));
	const tq = $derived(tokenParam ? `?t=${tokenParam}` : '');
	const messages = $derived(data.thread.messages);
	const proName = $derived(data.thread.professionalName);

	let draft = $state('');
	let sending = $state(false);
	let listEl = $state<HTMLDivElement | null>(null);

	// Rola pro fim ao abrir e quando chega mensagem nova.
	$effect(() => {
		void messages.length;
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	});

	// Live update por polling. O app do aluno autentica por token (não por
	// sessão Supabase), então o realtime via anon key não passaria na RLS de
	// `messages` — e abrir a tabela pro anon vazaria conversas. invalidateAll
	// re-roda o load no servidor, que revalida o token: seguro e simples.
	// Só enquanto a aba está visível, pra não bater no servidor em background.
	let pollId: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		const poll = () => {
			if (document.visibilityState === 'visible') invalidateAll().catch(() => {});
		};
		pollId = setInterval(poll, 12_000);
	});
	onDestroy(() => {
		if (pollId) clearInterval(pollId);
	});

	function timeFmt(d: Date | string) {
		return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
	}

	function initials(name: string) {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase())
			.join('');
	}
</script>

<svelte:head>
	<title>Mensagens · {proName}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="page">
	<header class="topbar">
		<button onclick={() => goto(`/a/${studentId}${tq}`)} class="back-btn" aria-label="Voltar">←</button>
		<div class="pro-avatar">{initials(proName)}</div>
		<div style="flex:1;min-width:0">
			<div style="font:600 15px var(--font-sans);color:var(--ink-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
				{proName}
			</div>
			<div class="eyebrow" style="margin-top:1px">seu treinador</div>
		</div>
	</header>

	<div bind:this={listEl} class="msg-list">
		{#if messages.length === 0}
			<div class="empty">
				<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:6px">
					Fale com seu treinador
				</div>
				<div style="font:var(--body);color:var(--ink-2)">
					Dúvidas sobre carga, execução ou como você se sentiu no treino? Manda aqui.
				</div>
			</div>
		{/if}
		{#each messages as m (m.id)}
			<div class="row" class:mine={m.fromRole === 'student'}>
				<div class="bubble" class:mine={m.fromRole === 'student'}>
					<div class="bubble-body">{m.body}</div>
					<div class="bubble-time">{timeFmt(m.createdAt)}</div>
				</div>
			</div>
		{/each}
	</div>

	<form
		method="POST"
		action="?/send{tq}"
		class="composer"
		use:enhance={() => {
			sending = true;
			return async ({ result, update }) => {
				await update();
				sending = false;
				if (result.type === 'success') {
					draft = '';
					await invalidateAll();
					await tick();
					if (listEl) listEl.scrollTop = listEl.scrollHeight;
				}
			};
		}}
	>
		{#if tokenParam}<input type="hidden" name="_t" value={tokenParam} />{/if}
		<textarea
			name="body"
			bind:value={draft}
			placeholder="Escreva uma mensagem…"
			rows="1"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					if (!sending && draft.trim()) e.currentTarget.form?.requestSubmit();
				}
			}}
		></textarea>
		<button type="submit" class="send-btn" disabled={sending || !draft.trim()} aria-label="Enviar">
			{sending ? '…' : '↑'}
		</button>
	</form>
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100vh;
		min-height: 0;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--ink-line);
		background: var(--bg-1);
		position: sticky;
		top: 0;
		z-index: 10;
		flex-shrink: 0;
	}
	.back-btn {
		width: 40px;
		height: 40px;
		background: var(--bg-3);
		color: var(--ink-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-1);
		cursor: pointer;
		font-size: 18px;
		flex-shrink: 0;
	}
	.pro-avatar {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--accent-wash);
		color: var(--accent-2);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 13px var(--font-sans);
		flex-shrink: 0;
	}
	.msg-list {
		flex: 1;
		overflow-y: auto;
		padding: 20px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
	}
	.empty {
		margin: auto;
		text-align: center;
		max-width: 300px;
		padding: 24px;
	}
	.row {
		display: flex;
		justify-content: flex-start;
	}
	.row.mine {
		justify-content: flex-end;
	}
	.bubble {
		max-width: 78%;
		padding: 10px 14px;
		border-radius: 16px 16px 16px 4px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		animation: pf-fade-up 200ms var(--ease) backwards;
	}
	.bubble.mine {
		border-radius: 16px 16px 4px 16px;
		background: var(--accent);
		border: none;
		color: #0a0a0a;
	}
	.bubble-body {
		font: var(--body) var(--font-sans);
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.bubble-time {
		font: var(--label-mono);
		margin-top: 3px;
		opacity: 0.6;
	}
	.composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--ink-line);
		background: var(--bg-1);
		flex-shrink: 0;
	}
	.composer textarea {
		flex: 1;
		padding: 11px 14px;
		background: var(--bg-2);
		color: var(--ink-0);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		outline: none;
		resize: none;
		max-height: 120px;
		font: var(--body) var(--font-sans);
	}
	.composer textarea:focus {
		border-color: var(--accent);
	}
	.send-btn {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--accent);
		color: #0a0a0a;
		border: none;
		font-size: 20px;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 140ms var(--ease-spring);
	}
	.send-btn:active {
		transform: scale(0.9);
	}
	.send-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
