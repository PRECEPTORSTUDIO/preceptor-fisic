<script lang="ts">
	import { Chip, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const sessions = $derived(data.sessions);
	const studentId = $derived(data.student.id);
	const tokenParam = $derived(page.url.searchParams.get('t'));
	const tq = $derived(tokenParam ? `?t=${tokenParam}` : '');

	function fmtDate(iso: string) {
		const d = new Date(iso);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);
		if (d.toDateString() === today.toDateString()) return 'hoje';
		if (d.toDateString() === yesterday.toDateString()) return 'ontem';
		return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
	}

	function exDoneCount(exDone: any[] | null): { done: number; total: number } {
		if (!exDone) return { done: 0, total: 0 };
		return { done: exDone.filter((x) => x.completed).length, total: exDone.length };
	}
</script>

<svelte:head>
	<title>Histórico · {data.student.name}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="page">
	<header class="topbar">
		<button onclick={() => goto(`/a/${studentId}${tq}`)} class="back-btn">←</button>
		<div style="flex:1;text-align:center">
			<div class="eyebrow">Histórico</div>
			<div style="font:500 16px var(--font-sans)">{sessions.length} sessões registradas</div>
		</div>
		<div style="width:40px"></div>
	</header>

	{#if sessions.length === 0}
		<div style="padding:40px 24px;text-align:center">
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">Nenhuma sessão ainda</div>
			<div style="font:var(--body);color:var(--ink-2)">Suas sessões concluídas aparecem aqui.</div>
		</div>
	{:else}
		<div class="history-list">
			{#each sessions as s (s.id)}
				{@const ex = exDoneCount(s.exercisesDone as any)}
				{@const allDone = ex.total > 0 && ex.done === ex.total}
				<div class="session-card">
					<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
						<div>
							<div class="eyebrow">{fmtDate(s.sessionDate)}</div>
							<div style="font:500 15px var(--font-sans);color:var(--ink-0);margin-top:4px">
								{s.sessionLabel ?? 'Sessão'}
							</div>
						</div>
						<Chip variant={allDone ? 'success' : ex.done > 0 ? 'warn' : 'default'}>
							{allDone ? '● completo' : ex.done > 0 ? `${ex.done}/${ex.total}` : '○ vazio'}
						</Chip>
					</div>
					<div style="display:flex;gap:14px;font:var(--body-sm);color:var(--ink-2)">
						{#if s.perceivedEffort}
							<span>PSE <span style="color:var(--ink-1);font-family:var(--font-mono)">{s.perceivedEffort}</span></span>
						{/if}
						<span>{ex.done}/{ex.total} exercícios</span>
					</div>
					{#if s.observations}
						<div
							style="margin-top:10px;padding:10px 12px;background:var(--bg-3);border-radius:var(--r-2);font:var(--body-sm);color:var(--ink-1);line-height:1.5"
						>
							{s.observations}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-bottom: 24px;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--ink-line);
		background: var(--bg-1);
		position: sticky;
		top: 0;
		z-index: 10;
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
	}
	.history-list {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.session-card {
		padding: 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
	}
	/* Desktop dashboard mode */
	@media (min-width: 1024px) {
		.topbar {
			background: transparent;
			border-bottom: 0;
			padding: 0 8px 16px;
		}
		.history-list {
			padding: 0 8px;
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 12px;
		}
	}
</style>
