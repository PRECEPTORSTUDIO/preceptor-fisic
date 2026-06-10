<script lang="ts">
	import { Button, Chip, Avatar, Eyebrow } from '$lib/components/ui';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onMount, onDestroy } from 'svelte';
	import { createBrowserClient } from '@supabase/ssr';
	import { env } from '$env/dynamic/public';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const threads = $derived(data.threads);
	const activeId = $derived(data.activeId);
	const messages = $derived(data.activeMessages);

	let draft = $state('');
	let activeFilter = $state('all');
	let sending = $state(false);

	// Realtime via Supabase channels — escuta INSERT em messages.
	// Quando chega novo, invalida load function pra atualizar threads + msgs.
	let realtimeUnsub: (() => void) | undefined;
	onMount(() => {
		const url = env.PUBLIC_SUPABASE_URL;
		const anon = env.PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return;

		// No browser, createBrowserClient gerencia document.cookie sozinho.
		// Passar { cookies } parcial quebra (exige getAll + setAll juntos).
		// Todo o setup é envolvido em try/catch — falha de realtime jamais
		// pode derrubar o componente (View Transitions abortariam → trava nav).
		try {
			const sb = createBrowserClient(url, anon);
			const channel = sb
				.channel('messages-realtime')
				.on(
					'postgres_changes',
					{ event: 'INSERT', schema: 'public', table: 'messages' },
					() => {
						invalidateAll().catch(() => {});
					}
				)
				.subscribe();

			realtimeUnsub = () => {
				try {
					channel.unsubscribe();
					sb.removeAllChannels();
				} catch {
					/* noop */
				}
			};
		} catch {
			/* realtime indisponível — página funciona normal sem live update */
		}
	});
	onDestroy(() => realtimeUnsub?.());

	const cur = $derived(threads.find((t) => t.id === activeId));
	const totalUnread = $derived(threads.reduce((a, t) => a + t.unread, 0));

	function timeFmt(d: Date | null) {
		if (!d) return '—';
		const date = new Date(d);
		const today = new Date();
		const sameDay = date.toDateString() === today.toDateString();
		if (sameDay) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
		const days = Math.floor((today.getTime() - date.getTime()) / (24 * 3600 * 1000));
		if (days < 2) return 'ontem';
		if (days < 7) return `${days}d`;
		return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
	}

	const quickReplies = ['Bora aumentar 10%', 'Mantém a carga', 'Vou ajustar o plano', 'Manda vídeo'];
</script>

<div class="msg-grid" style="display:grid;grid-template-columns:360px 1fr 320px;height:100vh;overflow:hidden">
	<!-- Inbox -->
	<aside class="msg-inbox" class:has-active={Boolean(cur)} style="border-right:1px solid var(--ink-line);display:flex;flex-direction:column;overflow:hidden">
		<div style="padding:24px 20px 16px;border-bottom:1px solid var(--ink-line)">
			<Eyebrow>Caixa de entrada · {totalUnread} não lidas</Eyebrow>
			<h1 style="font:var(--display-md);margin:6px 0 14px;letter-spacing:-0.025em">Mensagens</h1>
			<input
				placeholder="⌕  Buscar conversas…"
				style="width:100%;box-sizing:border-box;padding:10px 14px;background:var(--bg-2);color:var(--ink-0);border:1px solid var(--ink-line);border-radius:var(--r-2);font:var(--body-sm) var(--font-sans);outline:none"
			/>
		</div>
		<div style="display:flex;gap:4px;padding:10px 16px;border-bottom:1px solid var(--ink-line)">
			{#each [['all', 'Todas'], ['unread', 'Não lidas']] as [k, l] (k)}
				<Chip active={activeFilter === k} onclick={() => k && (activeFilter = k)}>
					{l}
					{#if k === 'all'}<span class="num" style="margin-left:4px">{threads.length}</span>{/if}
					{#if k === 'unread'}<span class="num" style="margin-left:4px;color:var(--accent)">{totalUnread}</span>{/if}
				</Chip>
			{/each}
		</div>
		<div style="overflow-y:auto;flex:1">
			{#if threads.length === 0}
				<div style="padding:32px;text-align:center">
					<div style="font:var(--body-sm);color:var(--ink-2)">Nenhuma conversa ainda.</div>
					<div style="font:var(--label-mono);color:var(--ink-3);margin-top:8px">As conversas aparecem aqui quando alunos enviam a primeira mensagem.</div>
				</div>
			{/if}
			{#each threads as t (t.id)}
				<button
					type="button"
					onclick={() => goto(`/mensagens?t=${t.id}`, { replaceState: true })}
					style="all:unset;cursor:pointer;display:flex;gap:12px;padding:14px 18px;width:100%;box-sizing:border-box;background:{activeId === t.id
						? 'var(--accent-wash)'
						: 'transparent'};border-bottom:1px solid var(--ink-line);position:relative;align-items:flex-start"
				>
					{#if activeId === t.id}
						<span style="position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)"></span>
					{/if}
					<div style="position:relative;flex-shrink:0">
						<Avatar name={t.studentName} size={40} />
						{#if t.online}
							<span
								style="position:absolute;bottom:0;right:0;width:10px;height:10px;background:var(--success);border-radius:50%;border:2px solid var(--bg-1)"
							></span>
						{/if}
					</div>
					<div style="flex:1;min-width:0">
						<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
							<span
								style="font:500 14px var(--font-sans);color:var(--ink-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
							>{t.studentName}</span>
							<span style="font:var(--label-mono);color:var(--ink-3);flex-shrink:0">{timeFmt(t.lastAt)}</span>
						</div>
						<div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;align-items:center">
							<span
								style="font:var(--body-sm);color:{t.unread
									? 'var(--ink-0)'
									: 'var(--ink-2)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-weight:{t.unread
									? 500
									: 400}"
							>{t.last ?? 'sem mensagens'}</span>
							{#if t.unread > 0}
								<span
									class="num"
									style="font:600 11px var(--font-mono);color:#0a0a0a;background:var(--accent);padding:2px 7px;border-radius:var(--r-pill);flex-shrink:0"
								>{t.unread}</span>
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>
	</aside>

	<!-- Thread -->
	<section class="msg-thread" class:has-active={Boolean(cur)} style="display:flex;flex-direction:column;overflow:hidden;background:var(--bg-0)">
		{#if !cur}
			<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--ink-2)">
				Selecione uma conversa
			</div>
		{:else}
			<header
				style="display:flex;align-items:center;gap:14px;padding:20px 28px;border-bottom:1px solid var(--ink-line);background:var(--bg-1)"
			>
				<!-- ?t=inbox não casa com nenhum thread → cur=undefined → inbox visível.
				     Evita o auto-select do load (threads[0]) que prenderia o user na thread. -->
				<button type="button" class="msg-back" onclick={() => goto('/mensagens?t=inbox', { replaceState: true })}>←</button>
				<Avatar name={cur.studentName} size={44} />
				<div style="flex:1">
					<div style="font:600 16px var(--font-sans);color:var(--ink-0)">{cur.studentName}</div>
					<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
						{cur.lastAt ? `última mensagem ${timeFmt(cur.lastAt)}` : 'sem mensagens'}
					</div>
				</div>
				<Button variant="secondary" size="sm" onclick={() => goto(`/alunos/${cur.studentId}`)}>Ver ficha →</Button>
			</header>

			<div style="flex:1;overflow-y:auto;padding:32px 40px">
				{#if messages.length === 0}
					<div style="text-align:center;color:var(--ink-2);font:var(--body-sm)">Sem mensagens ainda.</div>
				{/if}
				{#each messages as m (m.id)}
					<div
						style="display:flex;justify-content:{m.fromRole === 'student' ? 'flex-start' : 'flex-end'};margin-bottom:8px"
					>
						<div
							style="max-width:70%;display:flex;flex-direction:column;align-items:{m.fromRole === 'student'
								? 'flex-start'
								: 'flex-end'}"
						>
							<div
								style="padding:10px 14px;background:{m.fromRole === 'student'
									? 'var(--bg-2)'
									: 'var(--accent)'};color:{m.fromRole === 'student'
									? 'var(--ink-0)'
									: '#0a0a0a'};border:{m.fromRole === 'student'
									? '1px solid var(--ink-line)'
									: 'none'};border-radius:14px;font:var(--body) var(--font-sans);line-height:1.45"
							>{m.body}</div>
							<span class="num" style="font:var(--label-mono);color:var(--ink-3);margin-top:4px;padding:0 4px">
								{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
					</div>
				{/each}
			</div>

			<form
				method="POST"
				action="?/send"
				use:enhance={() => {
					sending = true;
					return async ({ update }) => {
						await update();
						sending = false;
						draft = '';
						await invalidateAll();
					};
				}}
				style="padding:20px;border-top:1px solid var(--ink-line);background:var(--bg-1)"
			>
				<input type="hidden" name="conversationId" value={cur.id} />
				<div style="display:flex;gap:6px;margin-bottom:10px">
					{#each quickReplies as s (s)}
						<Chip onclick={() => (draft = s)}>{s}</Chip>
					{/each}
				</div>
				<div
					style="display:flex;gap:10px;align-items:flex-end;padding:4px;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2)"
				>
					<textarea
						name="body"
						bind:value={draft}
						placeholder="Escreva uma resposta…"
						rows="1"
						style="flex:1;padding:10px 12px;background:transparent;color:var(--ink-0);border:0;outline:none;resize:none;font:var(--body) var(--font-sans)"
					></textarea>
					<Button type="submit" disabled={sending || !draft.trim()}>
						{sending ? 'Enviando…' : 'Enviar ↵'}
					</Button>
				</div>
			</form>
		{/if}
	</section>

	<!-- Context panel -->
	<aside class="msg-context" style="border-left:1px solid var(--ink-line);overflow-y:auto;padding:24px;background:var(--bg-1)">
		{#if cur}
			<Eyebrow>Contexto do aluno</Eyebrow>
			<h3 style="font:600 18px var(--font-sans);margin:8px 0 16px;color:var(--ink-0)">{cur.studentName}</h3>
			<Button variant="secondary" size="sm" style="width:100%" onclick={() => goto(`/alunos/${cur.studentId}`)}>Abrir ficha completa</Button>
		{:else}
			<Eyebrow>Sem conversa selecionada</Eyebrow>
		{/if}
	</aside>
</div>

<style>
	/* Botão "voltar" só existe no modo mobile single-pane */
	.msg-back {
		display: none;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		cursor: pointer;
		width: 36px;
		height: 36px;
		border-radius: var(--r-1);
		color: var(--ink-1);
		font: 400 18px var(--font-sans);
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* Mobile/tablet: 3 colunas viram single-pane (inbox OU thread).
	   O grid fixo 360+320px estourava o viewport abaixo de ~1100px. */
	@media (max-width: 1100px) {
		.msg-grid {
			grid-template-columns: 1fr !important;
		}
		.msg-context {
			display: none;
		}
		/* Com conversa ativa: mostra thread, esconde inbox. Sem: o inverso. */
		.msg-inbox.has-active {
			display: none !important;
		}
		.msg-thread:not(.has-active) {
			display: none !important;
		}
		.msg-back {
			display: flex;
		}
	}
</style>
