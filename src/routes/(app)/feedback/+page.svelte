<script lang="ts">
	import { Button, Eyebrow, toast } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const CATEGORIES = [
		{ id: 'bug', label: 'Bug / erro' },
		{ id: 'sugestao', label: 'Sugestão' },
		{ id: 'duvida', label: 'Dúvida' },
		{ id: 'elogio', label: 'Elogio' },
		{ id: 'outro', label: 'Outro' }
	];
	const CAT_LABEL: Record<string, string> = Object.fromEntries(
		CATEGORIES.map((c) => [c.id, c.label])
	);
	const CAT_COLOR: Record<string, string> = {
		bug: 'var(--danger)',
		sugestao: 'var(--accent)',
		duvida: 'var(--info)',
		elogio: 'var(--success)',
		outro: 'var(--ink-3)'
	};

	let category = $state('sugestao');
	let message = $state('');
	let submitting = $state(false);
	let summarizing = $state(false);

	// Acessores seguros — `form` é união das actions (submit/summarize), então
	// evitamos depender de narrowing do TS no template.
	const summary = $derived(
		form && 'summary' in form ? ((form as { summary?: string }).summary ?? null) : null
	);
	const summarizedCount = $derived(
		form && 'summarizedCount' in form
			? ((form as { summarizedCount?: number }).summarizedCount ?? null)
			: null
	);

	function fmtDate(d: Date | string) {
		return new Date(d).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div style="max-width:760px;margin:0 auto;padding:24px 20px 64px">
	<Eyebrow>◆ Beta</Eyebrow>
	<h1 style="font:600 24px var(--font-sans);color:var(--ink-0);margin:6px 0 4px;letter-spacing:-0.02em">
		Feedback
	</h1>
	<p style="font:var(--body-sm);color:var(--ink-2);margin:0 0 24px">
		Achou um bug, tem uma ideia ou algo te incomodou? Conta aqui — a gente lê tudo.
	</p>

	<!-- Form de envio -->
	<form
		method="POST"
		action="?/submit"
		class="card"
		style="padding:18px;display:flex;flex-direction:column;gap:14px"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'success') {
					toast.success('Feedback enviado. Valeu!');
					message = '';
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error(String(result.data?.error ?? 'Não foi possível enviar.'));
				} else {
					await update();
				}
			};
		}}
	>
		<div>
			<label
				for="fb-cat"
				style="display:block;font:500 12px var(--font-sans);color:var(--ink-1);margin-bottom:6px"
				>Categoria</label
			>
			<div style="display:flex;flex-wrap:wrap;gap:8px">
				{#each CATEGORIES as c (c.id)}
					<button
						type="button"
						onclick={() => (category = c.id)}
						style="padding:7px 12px;border-radius:var(--r-pill);cursor:pointer;font:500 12.5px var(--font-sans);border:1px solid {category ===
						c.id
							? CAT_COLOR[c.id]
							: 'var(--ink-line)'};background:{category === c.id
							? 'var(--bg-3)'
							: 'transparent'};color:{category === c.id ? 'var(--ink-0)' : 'var(--ink-2)'}"
					>
						{c.label}
					</button>
				{/each}
			</div>
			<input type="hidden" name="category" value={category} />
		</div>

		<div>
			<label
				for="fb-msg"
				style="display:block;font:500 12px var(--font-sans);color:var(--ink-1);margin-bottom:6px"
				>Seu feedback</label
			>
			<textarea
				id="fb-msg"
				name="message"
				bind:value={message}
				rows="5"
				maxlength="4000"
				placeholder="Descreva o que aconteceu, o que esperava, ou a ideia que teve…"
				style="width:100%;resize:vertical;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2);padding:12px;font:400 14px var(--font-sans);color:var(--ink-0);outline:none"
			></textarea>
		</div>

		<div>
			<label
				for="fb-page"
				style="display:block;font:500 12px var(--font-sans);color:var(--ink-1);margin-bottom:6px"
				>Onde aconteceu? <span style="color:var(--ink-3);font-weight:400">(opcional)</span></label
			>
			<input
				id="fb-page"
				name="page"
				placeholder="Ex: tela de gerar plano, agenda…"
				style="width:100%;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2);padding:10px 12px;font:400 13.5px var(--font-sans);color:var(--ink-0);outline:none"
			/>
		</div>

		<div style="display:flex;justify-content:flex-end">
			<Button type="submit" disabled={submitting || message.trim().length < 3}>
				{submitting ? 'Enviando…' : 'Enviar feedback'}
			</Button>
		</div>
	</form>

	<!-- Meus feedbacks -->
	{#if data.mine.length > 0}
		<div style="font:500 15px var(--font-sans);color:var(--ink-0);margin:28px 0 12px">
			Seus feedbacks enviados
		</div>
		<div style="display:flex;flex-direction:column;gap:8px">
			{#each data.mine as f (f.id)}
				<div class="card" style="padding:12px 14px">
					<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
						<span
							style="font:500 10.5px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:{CAT_COLOR[
								f.category
							]}">{CAT_LABEL[f.category] ?? f.category}</span
						>
						<span style="font:var(--label-mono);color:var(--ink-3)">{fmtDate(f.createdAt)}</span>
					</div>
					<div style="font:400 13.5px var(--font-sans);color:var(--ink-1);white-space:pre-wrap">{f.message}</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Painel admin -->
	{#if data.isAdmin}
		<div style="margin-top:36px;padding-top:24px;border-top:1px solid var(--ink-line)">
			<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
				<div>
					<Eyebrow>◆ Admin</Eyebrow>
					<div style="font:600 17px var(--font-sans);color:var(--ink-0);margin-top:4px">
						Todos os feedbacks · {data.all.length}
					</div>
				</div>
				<form
					method="POST"
					action="?/summarize"
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
					<Button type="submit" variant="secondary" disabled={summarizing || data.all.length === 0}>
						{summarizing ? 'Resumindo com IA…' : '✦ Gerar resumo (IA)'}
					</Button>
				</form>
			</div>

			{#if summary}
				<div
					class="card"
					style="padding:18px;margin-bottom:18px;border-left:3px solid var(--accent)"
				>
					<div style="font:500 12px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:10px">
						Resumo por IA{summarizedCount ? ` · ${summarizedCount} feedbacks` : ''}
					</div>
					<div style="font:400 14px var(--font-sans);color:var(--ink-1);line-height:1.6;white-space:pre-wrap">{summary}</div>
				</div>
			{/if}

			{#if data.all.length === 0}
				<div class="card" style="padding:24px;text-align:center;color:var(--ink-2)">
					Nenhum feedback recebido ainda.
				</div>
			{:else}
				<div style="display:flex;flex-direction:column;gap:8px">
					{#each data.all as f (f.id)}
						<div class="card" style="padding:12px 14px">
							<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
								<span
									style="font:500 10.5px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:{CAT_COLOR[
										f.category
									]}">{CAT_LABEL[f.category] ?? f.category}</span
								>
								<span style="font:500 12px var(--font-sans);color:var(--ink-1)">{f.authorName ?? 'Anônimo'}</span>
								{#if f.page}<span style="font:var(--label-mono);color:var(--ink-3)">· {f.page}</span>{/if}
								<span style="font:var(--label-mono);color:var(--ink-3);margin-left:auto">{fmtDate(f.createdAt)}</span>
							</div>
							<div style="font:400 13.5px var(--font-sans);color:var(--ink-1);white-space:pre-wrap">{f.message}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
