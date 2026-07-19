<script lang="ts">
	import { Button, Chip, Eyebrow, Avatar, toast } from '$lib/components/ui';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { LeadListItem, LeadStage, LeadSource } from '$lib/server/queries';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const leads = $derived(data.leads as LeadListItem[]);
	const counts = $derived(data.counts);

	// Feedbacks dos beta testers (admin vê aqui no CRM).
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
	// TUDO primeiro e só então converte **x** → <strong> (quebras de linha
	// ficam por conta do pre-wrap). Nada de innerHTML cru.
	function renderSummary(md: string): string {
		const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return esc.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	}

	type View = 'kanban' | 'tabela';
	let view = $state<View>('kanban');

	const STAGES: { id: LeadStage; label: string; color: string; bg: string }[] = [
		{ id: 'visitante', label: 'Visitante', color: 'var(--ink-2)', bg: 'rgba(255,255,255,0.03)' },
		{ id: 'cadastrou', label: 'Cadastrou', color: 'var(--info)', bg: 'rgba(96,165,250,0.08)' },
		{ id: 'ativou_aluno', label: 'Ativou aluno', color: 'var(--accent-2)', bg: 'rgba(196,181,253,0.10)' },
		{ id: 'trial', label: 'Trial', color: 'var(--warn)', bg: 'rgba(251,191,36,0.08)' },
		{ id: 'pagante', label: 'Pagante', color: 'var(--success)', bg: 'rgba(52,211,153,0.10)' },
		{ id: 'cancelado', label: 'Cancelado', color: 'var(--ink-3)', bg: 'rgba(255,255,255,0.02)' },
		{ id: 'perdido', label: 'Perdido', color: 'var(--danger)', bg: 'rgba(248,113,113,0.06)' }
	];

	const SOURCES: { id: LeadSource; label: string }[] = [
		{ id: 'instagram', label: 'Instagram' },
		{ id: 'indicacao', label: 'Indicação' },
		{ id: 'anuncio', label: 'Anúncio' },
		{ id: 'site', label: 'Site' },
		{ id: 'whatsapp', label: 'WhatsApp' },
		{ id: 'outro', label: 'Outro' }
	];

	function leadsByStage(stage: LeadStage): LeadListItem[] {
		return leads.filter((l) => l.stage === stage);
	}

	// Drag-and-drop state
	let dragId = $state<string | null>(null);
	let dragOverStage = $state<LeadStage | null>(null);

	function onDragStart(e: DragEvent, id: string) {
		dragId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', id);
		}
	}
	function onDragEnd() {
		dragId = null;
		dragOverStage = null;
	}
	function onDragOver(e: DragEvent, stage: LeadStage) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverStage = stage;
	}
	function onDragLeave() {
		dragOverStage = null;
	}

	async function onDrop(e: DragEvent, newStage: LeadStage) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/plain') ?? dragId;
		if (!id) return;
		const current = leads.find((l) => l.id === id);
		dragId = null;
		dragOverStage = null;
		if (!current || current.stage === newStage) return;

		const fd = new FormData();
		fd.set('id', id);
		fd.set('stage', newStage);
		const res = await fetch('?/moveStage', { method: 'POST', body: fd });
		if (res.ok) {
			toast.success(`Movido pra "${STAGES.find((s) => s.id === newStage)?.label}"`);
			await invalidateAll();
		} else {
			toast.error('Falha ao mover lead');
		}
	}

	// Quick create inline (no Kanban, dentro de cada coluna)
	let quickStage = $state<LeadStage | null>(null);
	let quickName = $state('');
	let quickSource = $state<LeadSource>('outro');

	function openQuickCreate(stage: LeadStage) {
		quickStage = stage;
		quickName = '';
		quickSource = 'outro';
	}

	// Tabela: filtros
	let filterStage = $state<LeadStage | 'all'>('all');
	let filterQuery = $state('');
	const filtered = $derived(
		leads.filter((l) => {
			if (filterStage !== 'all' && l.stage !== filterStage) return false;
			if (filterQuery) {
				const q = filterQuery.toLowerCase();
				if (
					!l.name.toLowerCase().includes(q) &&
					!(l.phone ?? '').toLowerCase().includes(q) &&
					!(l.email ?? '').toLowerCase().includes(q)
				)
					return false;
			}
			return true;
		})
	);

	const total = $derived(leads.length);
	// Métricas chave do funil: novos cadastros e taxa de conversão pra pagante
	const novosCount = $derived(counts.cadastrou);
	const pagantesCount = $derived(counts.pagante);
	const conversionRate = $derived(
		total > 0 ? Math.round((pagantesCount / total) * 100) : 0
	);

	function fmtDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
	}

	function sourceLabel(s: LeadSource): string {
		return SOURCES.find((x) => x.id === s)?.label ?? s;
	}
	function stageColor(s: LeadStage): string {
		return STAGES.find((x) => x.id === s)?.color ?? 'var(--ink-2)';
	}
	function stageLabel(s: LeadStage): string {
		return STAGES.find((x) => x.id === s)?.label ?? s;
	}
</script>

<svelte:head>
	<title>CRM · Preceptor Fisic</title>
</svelte:head>

<div class="crm-page">
	<header class="crm-header">
		<div style="min-width:0">
			<Eyebrow>{total} leads · {novosCount} novos cadastros · {conversionRate}% pagantes</Eyebrow>
			<h1 class="crm-h1">CRM</h1>
			<p class="crm-sub">
				Pipeline de leads do contato inicial até virar aluno ativo.
			</p>
		</div>
		<div class="crm-actions">
			<div class="view-toggle">
				<button
					type="button"
					class="vt-btn"
					class:on={view === 'kanban'}
					onclick={() => (view = 'kanban')}
				>▦ Kanban</button>
				<button
					type="button"
					class="vt-btn"
					class:on={view === 'tabela'}
					onclick={() => (view = 'tabela')}
				>☰ Tabela</button>
			</div>
			<Button onclick={() => goto('/crm/novo')}>+ Novo lead</Button>
		</div>
	</header>

	<!-- Funnel metrics row -->
	<div class="funnel-row">
		{#each STAGES as st (st.id)}
			{@const n = counts[st.id]}
			{@const pct = total > 0 ? Math.round((n / total) * 100) : 0}
			<div class="funnel-card" style="border-left: 3px solid {st.color}">
				<div class="eyebrow" style="color:{st.color};margin-bottom:6px">{st.label}</div>
				<div style="display:flex;align-items:baseline;gap:6px">
					<span class="num funnel-num">{n}</span>
					<span class="funnel-pct">{pct}%</span>
				</div>
			</div>
		{/each}
	</div>

	{#if total === 0}
		<div class="card empty-state">
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">Nenhum lead ainda</div>
			<div style="font:var(--body);color:var(--ink-2);max-width:420px;margin:0 auto 20px">
				Adicione um lead pra começar a acompanhar prospects no funil.
			</div>
			<Button onclick={() => goto('/crm/novo')}>+ Adicionar primeiro lead</Button>
		</div>
	{:else if view === 'kanban'}
		<!-- ════════ KANBAN ════════ -->
		<div class="kanban-scroll">
			<div class="kanban">
				{#each STAGES as st (st.id)}
					{@const items = leadsByStage(st.id)}
					<div
						class="kb-col"
						class:drag-over={dragOverStage === st.id}
						ondragover={(e) => onDragOver(e, st.id)}
						ondragleave={onDragLeave}
						ondrop={(e) => onDrop(e, st.id)}
						role="region"
						aria-label="Coluna {st.label}"
					>
						<div class="kb-col-head" style="background:{st.bg}">
							<div style="display:flex;align-items:center;gap:8px">
								<span class="kb-dot" style="background:{st.color}"></span>
								<span class="kb-col-label">{st.label}</span>
							</div>
							<span class="num kb-count">{items.length}</span>
						</div>
						<div class="kb-col-body">
							{#each items as lead (lead.id)}
								<button
									type="button"
									class="kb-card"
									class:dragging={dragId === lead.id}
									draggable="true"
									ondragstart={(e) => onDragStart(e, lead.id)}
									ondragend={onDragEnd}
									onclick={() => goto(`/crm/${lead.id}`)}
								>
									<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
										<Avatar name={lead.name} size={28} />
										<span class="kb-card-name">{lead.name}</span>
									</div>
									{#if lead.phone}
										<div class="kb-card-meta">
											<span class="num">{lead.phone}</span>
										</div>
									{/if}
									<div class="kb-card-foot">
										<Chip>{sourceLabel(lead.source)}</Chip>
										{#if lead.nextFollowUpAt}
											<span class="kb-followup" title="Próximo follow-up">
												↻ {fmtDate(lead.nextFollowUpAt)}
											</span>
										{/if}
									</div>
								</button>
							{/each}

							{#if quickStage === st.id}
								<form
									method="POST"
									action="?/quickCreate"
									use:enhance={() => async ({ update, result }) => {
										await update();
										if (result.type === 'success') {
											toast.success('Lead criado');
											quickStage = null;
											quickName = '';
										}
										await invalidateAll();
									}}
									class="kb-quick"
								>
									<input type="hidden" name="stage" value={st.id} />
									<input
										name="name"
										bind:value={quickName}
										placeholder="Nome do lead…"
										class="kb-quick-input"
										required
									/>
									<select name="source" bind:value={quickSource} class="kb-quick-input">
										{#each SOURCES as s (s.id)}
											<option value={s.id}>{s.label}</option>
										{/each}
									</select>
									<div style="display:flex;gap:6px">
										<button type="submit" class="kb-quick-ok">Criar</button>
										<button type="button" class="kb-quick-cancel" onclick={() => (quickStage = null)}>
											Cancelar
										</button>
									</div>
								</form>
							{:else}
								<button type="button" class="kb-add" onclick={() => openQuickCreate(st.id)}>
									+ Adicionar lead
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<!-- ════════ TABELA ════════ -->
		<div class="tbl-filters">
			<div class="tbl-search">
				<span style="color:var(--ink-3)">⌕</span>
				<input
					bind:value={filterQuery}
					placeholder="Buscar nome, telefone, email…"
				/>
			</div>
			<div style="display:flex;gap:6px;flex-wrap:wrap">
				<Chip active={filterStage === 'all'} onclick={() => (filterStage = 'all')}>
					Todos · {total}
				</Chip>
				{#each STAGES as st (st.id)}
					<Chip active={filterStage === st.id} onclick={() => (filterStage = st.id)}>
						{st.label} · {counts[st.id]}
					</Chip>
				{/each}
			</div>
		</div>

		<div class="card crm-table-card">
			<table class="crm-table">
				<colgroup>
					<col class="col-nome" />
					<col class="col-contato" />
					<col class="col-stage" />
					<col class="col-fonte" />
					<col class="col-follow" />
					<col class="col-criado" />
					<col class="col-arrow" />
				</colgroup>
				<thead>
					<tr>
						<th>Lead</th>
						<th>Contato</th>
						<th>Estágio</th>
						<th>Fonte</th>
						<th>Follow-up</th>
						<th>Criado</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as lead (lead.id)}
						<tr onclick={() => goto(`/crm/${lead.id}`)} class="crm-row">
							<td>
								<div class="row-lead">
									<Avatar name={lead.name} size={32} />
									<span class="lead-name">{lead.name}</span>
								</div>
							</td>
							<td class="lead-contact">
								{#if lead.phone}<div class="num">{lead.phone}</div>{/if}
								{#if lead.email}<div class="lead-email">{lead.email}</div>{/if}
								{#if !lead.phone && !lead.email}<span style="color:var(--ink-3)">—</span>{/if}
							</td>
							<td>
								<span class="stage-pill" style="color:{stageColor(lead.stage)};border-color:{stageColor(lead.stage)}33;background:{stageColor(lead.stage)}10">
									● {stageLabel(lead.stage)}
								</span>
							</td>
							<td class="lead-source">{sourceLabel(lead.source)}</td>
							<td class="num lead-follow">{fmtDate(lead.nextFollowUpAt)}</td>
							<td class="num lead-date">{fmtDate(lead.createdAt)}</td>
							<td><span class="row-arrow">→</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if filtered.length === 0}
				<div style="padding:32px;text-align:center;font:var(--body-sm);color:var(--ink-2);border-top:1px solid var(--ink-line)">
					Nenhum lead com esses filtros.
				</div>
			{/if}
		</div>
	{/if}

	<!-- ───── Feedbacks dos beta testers ───── -->
	<section style="margin-top:32px;padding-top:24px;border-top:1px solid var(--ink-line)">
		<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
			<div>
				<Eyebrow>◆ Beta</Eyebrow>
				<div style="font:600 17px var(--font-sans);color:var(--ink-0);margin-top:4px">
					Feedbacks dos beta testers · {feedbacks.length}
				</div>
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
		</div>

		{#if fbSummary}
			<div class="card" style="padding:18px;margin-bottom:18px;border-left:3px solid var(--accent)">
				<div style="font:500 12px var(--font-mono);text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:10px">
					Resumo por IA{fbSummaryCount ? ` · ${fbSummaryCount} feedbacks` : ''}
				</div>
				<div style="font:400 14px var(--font-sans);color:var(--ink-1);line-height:1.6;white-space:pre-wrap">{@html renderSummary(fbSummary)}</div>
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
							<span style="font:500 12px var(--font-sans);color:var(--ink-1)">{f.authorName ?? 'Anônimo'}</span>
							{#if f.page}<span style="font:var(--label-mono);color:var(--ink-3)">· {f.page}</span>{/if}
							<span style="font:var(--label-mono);color:var(--ink-3);margin-left:auto">{fmtDate(f.createdAt)}</span>
						</div>
						<div style="font:400 13.5px var(--font-sans);color:var(--ink-1);white-space:pre-wrap">{f.message}</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#if form?.error}
		<div class="error-flash">⚠ {form.error}</div>
	{/if}
</div>

<style>
	.crm-page {
		padding: 28px 32px 64px;
		max-width: 1440px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.crm-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
	}
	.crm-h1 {
		font: 600 28px var(--font-sans);
		margin: 8px 0 0;
		letter-spacing: -0.025em;
	}
	.crm-sub {
		font: 400 14px var(--font-sans);
		color: var(--ink-2);
		margin: 6px 0 0;
		max-width: 540px;
	}
	.crm-actions {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-shrink: 0;
	}
	.view-toggle {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
	}
	.vt-btn {
		all: unset;
		cursor: pointer;
		padding: 6px 12px;
		font: var(--label-mono);
		color: var(--ink-3);
		border-radius: 6px;
		text-transform: uppercase;
		transition: all 140ms var(--ease);
	}
	.vt-btn.on {
		background: var(--bg-3);
		color: var(--ink-0);
	}
	.vt-btn:hover:not(.on) {
		color: var(--ink-1);
	}

	/* ─── Funnel metric strip ─── */
	.funnel-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 10px;
	}
	.funnel-card {
		padding: 14px 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-left-width: 3px;
		border-radius: var(--r-2);
	}
	.funnel-num {
		font: 500 22px var(--font-mono);
		color: var(--ink-0);
		font-variant-numeric: tabular-nums;
	}
	.funnel-pct {
		font: var(--label-mono);
		color: var(--ink-3);
	}

	.empty-state {
		padding: 48px;
		text-align: center;
	}

	/* ─── KANBAN ─── */
	.kanban-scroll {
		overflow-x: auto;
		margin: 0 -4px;
		padding: 0 4px 8px;
	}
	.kanban {
		display: grid;
		grid-template-columns: repeat(7, minmax(220px, 1fr));
		gap: 12px;
		min-width: 100%;
	}
	.kb-col {
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		display: flex;
		flex-direction: column;
		min-height: 200px;
		transition: border-color 140ms var(--ease), background 140ms var(--ease);
	}
	.kb-col.drag-over {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.kb-col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid var(--ink-line);
		border-radius: var(--r-2) var(--r-2) 0 0;
	}
	.kb-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.kb-col-label {
		font: 500 13px var(--font-sans);
		color: var(--ink-0);
	}
	.kb-count {
		font: var(--label-mono);
		color: var(--ink-2);
		padding: 2px 8px;
		background: var(--bg-3);
		border-radius: var(--r-pill);
		font-variant-numeric: tabular-nums;
	}
	.kb-col-body {
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}
	.kb-card {
		all: unset;
		display: block;
		cursor: grab;
		padding: 12px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		transition: all 120ms var(--ease);
		text-align: left;
	}
	.kb-card:hover {
		background: var(--bg-3);
		border-color: var(--ink-line-2);
		transform: translateY(-1px);
	}
	.kb-card:active {
		cursor: grabbing;
	}
	.kb-card.dragging {
		opacity: 0.35;
		transform: rotate(-1.5deg);
	}
	.kb-card-name {
		font: 500 13px var(--font-sans);
		color: var(--ink-0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.kb-card-meta {
		font: var(--body-sm);
		color: var(--ink-2);
		margin-bottom: 8px;
	}
	.kb-card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.kb-followup {
		font: var(--label-mono);
		color: var(--warn);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.kb-add {
		all: unset;
		cursor: pointer;
		padding: 8px 12px;
		font: var(--label-mono);
		color: var(--ink-3);
		text-align: center;
		border-radius: var(--r-1);
		border: 1px dashed var(--ink-line);
		transition: all 140ms var(--ease);
	}
	.kb-add:hover {
		color: var(--accent);
		border-color: var(--accent-dim);
		background: var(--accent-wash);
	}
	.kb-quick {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--bg-3);
		border: 1px solid var(--accent-dim);
		border-radius: var(--r-2);
	}
	.kb-quick-input {
		width: 100%;
		box-sizing: border-box;
		padding: 7px 10px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-1);
		color: var(--ink-0);
		font: var(--body-sm);
		outline: none;
	}
	.kb-quick-input:focus {
		border-color: var(--accent);
	}
	.kb-quick-ok {
		flex: 1;
		padding: 7px 10px;
		background: var(--accent);
		color: var(--on-accent);
		border: 0;
		border-radius: var(--r-1);
		cursor: pointer;
		font: 500 12px var(--font-sans);
	}
	.kb-quick-cancel {
		flex: 1;
		padding: 7px 10px;
		background: transparent;
		color: var(--ink-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-1);
		cursor: pointer;
		font: 500 12px var(--font-sans);
	}

	/* ─── TABELA ─── */
	.tbl-filters {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		flex-wrap: wrap;
	}
	.tbl-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 36px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		min-width: 260px;
		flex: 1;
	}
	.tbl-search input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--ink-0);
		font: var(--body-sm);
	}
	.crm-table-card {
		padding: 0;
		overflow: hidden;
	}
	.crm-table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	.crm-table thead th {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: left;
		padding: 12px 14px;
		background: var(--bg-1);
		font-weight: normal;
	}
	.crm-table tbody tr {
		cursor: pointer;
		border-top: 1px solid var(--ink-line);
		transition: background 140ms var(--ease);
	}
	.crm-table tbody tr:hover {
		background: var(--bg-2);
	}
	.crm-table tbody td {
		padding: 14px 14px;
		vertical-align: middle;
		overflow: hidden;
		font: var(--body-sm);
		color: var(--ink-1);
	}
	.col-nome { width: 22%; }
	.col-contato { width: 22%; }
	.col-stage { width: 16%; }
	.col-fonte { width: 12%; }
	.col-follow { width: 10%; }
	.col-criado { width: 10%; }
	.col-arrow { width: 36px; }

	.row-lead {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.lead-name {
		font: 500 14px var(--font-sans);
		color: var(--ink-0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lead-contact .num {
		font: 500 13px var(--font-mono);
		color: var(--ink-0);
	}
	.lead-email {
		font: var(--label-mono);
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	.lead-source {
		color: var(--ink-1);
	}
	.lead-follow,
	.lead-date {
		color: var(--ink-2);
		font: var(--label-mono);
	}
	.stage-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: 1px solid;
		border-radius: var(--r-pill);
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}
	.row-arrow {
		color: var(--accent);
		font-size: 16px;
	}

	.error-flash {
		padding: 12px 16px;
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		border-radius: var(--r-2);
		color: var(--danger);
		font: var(--body-sm);
	}

	/* ─── MOBILE ─── */
	@media (max-width: 1023px) {
		.crm-page {
			padding: 16px 14px 32px;
			gap: 14px;
		}
		.crm-header {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		.crm-h1 {
			font-size: 22px;
		}
		.crm-actions {
			width: 100%;
			justify-content: space-between;
		}
		.funnel-row {
			grid-template-columns: repeat(2, 1fr);
		}
		.kanban {
			grid-template-columns: repeat(7, minmax(200px, 220px));
		}
		.tbl-search {
			min-width: 0;
			width: 100%;
		}
	}
</style>
