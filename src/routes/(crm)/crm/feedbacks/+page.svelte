<script lang="ts">
	import { Button, toast } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const feedbacks = $derived(data.feedbacks ?? []);
	let summarizing = $state(false);

	const fbSummary = $derived(
		form && 'summary' in form ? ((form as { summary?: string }).summary ?? null) : null
	);
	const fbSummaryCount = $derived(
		form && 'summarizedCount' in form
			? ((form as { summarizedCount?: number }).summarizedCount ?? null)
			: null
	);
	const FB_CAT_LABEL: Record<string, string> = {
		bug: 'Bug / erro',
		sugestao: 'Sugestão',
		duvida: 'Dúvida',
		elogio: 'Elogio',
		outro: 'Outro'
	};
	const FB_CAT_COLOR: Record<string, string> = {
		bug: 'var(--danger)',
		sugestao: 'var(--accent)',
		duvida: 'var(--info)',
		elogio: 'var(--success)',
		outro: 'var(--ink-3)'
	};

	// Resumo IA vem em markdown leve. Renderização mínima e segura: escapa
	// TUDO primeiro e só então converte **x** → <strong>.
	function renderSummary(md: string): string {
		const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return esc.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	}
	function fmtDate(d: Date | string): string {
		return new Date(d)
			.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
			.replace('.', '');
	}
</script>

<svelte:head>
	<title>Feedbacks · CRM · PreceptorFISIC</title>
</svelte:head>

<div class="fb-page">
	<header class="fb-header">
		<div>
			<h1 class="fb-h1">Feedbacks dos beta testers</h1>
			<p class="fb-sub">{feedbacks.length} recebidos</p>
		</div>
		<form
			method="POST"
			action="?/summarizeFeedback"
			use:enhance={() => {
				summarizing = true;
				return async ({ result, update }) => {
					summarizing = false;
					if (result.type === 'failure') {
						toast.error(String(result.data?.error ?? 'Falha ao resumir.'));
					}
					await update({ reset: false });
				};
			}}
		>
			<Button type="submit" variant="secondary" disabled={summarizing || feedbacks.length === 0}>
				{summarizing ? 'Resumindo com IA…' : '✦ Gerar resumo (IA)'}
			</Button>
		</form>
	</header>

	{#if fbSummary}
		<div class="card" style="padding:18px;border-left:3px solid var(--accent)">
			<div
				style="font:500 12px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:10px"
			>
				Resumo por IA{fbSummaryCount ? ` · ${fbSummaryCount} feedbacks` : ''}
			</div>
			<div
				style="font:400 14px var(--font-sans);color:var(--ink-1);line-height:1.6;white-space:pre-wrap"
			>
				{@html renderSummary(fbSummary)}
			</div>
		</div>
	{/if}

	{#if feedbacks.length === 0}
		<div class="card" style="padding:24px;text-align:center;font:var(--body-sm);color:var(--ink-2)">
			Nenhum feedback recebido ainda.
		</div>
	{:else}
		<div style="display:flex;flex-direction:column;gap:8px">
			{#each feedbacks as f (f.id)}
				<div class="card" style="padding:12px 14px">
					<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
						<span
							style="font:500 10.5px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:{FB_CAT_COLOR[
								f.category
							]}">{FB_CAT_LABEL[f.category] ?? f.category}</span
						>
						<span style="font:500 12px var(--font-sans);color:var(--ink-1)"
							>{f.authorName ?? 'Anônimo'}</span
						>
						{#if f.page}<span style="font:var(--label-mono);color:var(--ink-3)">· {f.page}</span
							>{/if}
						<span style="font:var(--label-mono);color:var(--ink-3);margin-left:auto"
							>{fmtDate(f.createdAt)}</span
						>
					</div>
					<div style="font:400 13.5px var(--font-sans);color:var(--ink-1);white-space:pre-wrap">
						{f.message}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if form?.error}
		<div class="error-flash">⚠ {form.error}</div>
	{/if}
</div>

<style>
	.fb-page {
		padding: 28px 32px 64px;
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.fb-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
	}
	.fb-h1 {
		font: 600 24px var(--font-sans);
		margin: 0;
		letter-spacing: -0.02em;
		color: var(--ink-0);
	}
	.fb-sub {
		font: var(--body-sm);
		color: var(--ink-2);
		margin: 4px 0 0;
	}
	.error-flash {
		padding: 12px 16px;
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		border-radius: var(--r-2);
		color: var(--danger);
		font: var(--body-sm);
	}
	@media (max-width: 767px) {
		.fb-page {
			padding: 16px 14px 32px;
		}
	}
</style>
