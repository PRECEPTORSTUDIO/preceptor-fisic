<script lang="ts">
	import { Button, Chip, Avatar, toast } from '$lib/components/ui';
	import { goto, invalidateAll } from '$app/navigation';
	import type { LeadListItem, LeadStage, LeadSource } from '$lib/server/queries';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const leads = $derived(data.leads as LeadListItem[]);
	const counts = $derived(data.counts);
	const total = $derived(leads.length);

	const STAGES: { id: LeadStage; label: string; color: string }[] = [
		{ id: 'visitante', label: 'Visitante', color: 'var(--ink-2)' },
		{ id: 'cadastrou', label: 'Cadastrou', color: 'var(--info)' },
		{ id: 'ativou_aluno', label: 'Ativou aluno', color: 'var(--accent-2)' },
		{ id: 'trial', label: 'Trial', color: 'var(--warn)' },
		{ id: 'pagante', label: 'Pagante', color: 'var(--success)' },
		{ id: 'cancelado', label: 'Cancelado', color: 'var(--ink-3)' },
		{ id: 'perdido', label: 'Perdido', color: 'var(--danger)' }
	];
	const SOURCES: { id: LeadSource; label: string }[] = [
		{ id: 'instagram', label: 'Instagram' },
		{ id: 'indicacao', label: 'Indicação' },
		{ id: 'anuncio', label: 'Anúncio' },
		{ id: 'site', label: 'Site' },
		{ id: 'whatsapp', label: 'WhatsApp' },
		{ id: 'outro', label: 'Outro' }
	];

	// Filtros + ordenação
	let filterStage = $state<LeadStage | 'all'>('all');
	let filterSource = $state<LeadSource | 'all'>('all');
	let filterQuery = $state('');
	type SortKey = 'createdAt' | 'name' | 'nextFollowUpAt';
	let sortKey = $state<SortKey>('createdAt');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function toggleSort(k: SortKey) {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = k;
			sortDir = k === 'name' ? 'asc' : 'desc';
		}
	}

	const filtered = $derived(
		leads
			.filter((l) => {
				if (filterStage !== 'all' && l.stage !== filterStage) return false;
				if (filterSource !== 'all' && l.source !== filterSource) return false;
				if (filterQuery) {
					const q = filterQuery.toLowerCase();
					if (
						!l.name.toLowerCase().includes(q) &&
						!(l.phone ?? '').toLowerCase().includes(q) &&
						!(l.email ?? '').toLowerCase().includes(q) &&
						!(l.notes ?? '').toLowerCase().includes(q)
					)
						return false;
				}
				return true;
			})
			.sort((a, b) => {
				const dir = sortDir === 'asc' ? 1 : -1;
				if (sortKey === 'name') return a.name.localeCompare(b.name, 'pt-BR') * dir;
				const av = a[sortKey] ? new Date(a[sortKey]!).getTime() : 0;
				const bv = b[sortKey] ? new Date(b[sortKey]!).getTime() : 0;
				return (av - bv) * dir;
			})
	);

	function sourceLabel(s: LeadSource): string {
		return SOURCES.find((x) => x.id === s)?.label ?? s;
	}
	function stageColor(s: LeadStage): string {
		return STAGES.find((x) => x.id === s)?.color ?? 'var(--ink-2)';
	}
	function fmtDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d)
			.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
			.replace('.', '');
	}
	function isLate(l: LeadListItem): boolean {
		return Boolean(
			l.nextFollowUpAt &&
				new Date(l.nextFollowUpAt).getTime() < Date.now() &&
				l.stage !== 'cancelado' &&
				l.stage !== 'perdido'
		);
	}

	// Mudança de estágio inline (select por linha, sem sair da tabela)
	async function changeStage(id: string, stage: LeadStage) {
		const fd = new FormData();
		fd.set('id', id);
		fd.set('stage', stage);
		const res = await fetch('?/moveStage', { method: 'POST', body: fd });
		if (res.ok) {
			toast.success(`Movido pra "${STAGES.find((s) => s.id === stage)?.label}"`);
			await invalidateAll();
		} else {
			toast.error('Falha ao mover lead');
		}
	}

	function exportCsv() {
		const header = 'nome,email,telefone,estagio,origem,follow_up,criado';
		const rows = filtered.map((l) =>
			[
				l.name,
				l.email ?? '',
				l.phone ?? '',
				l.stage,
				l.source,
				l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString().slice(0, 10) : '',
				new Date(l.createdAt).toISOString().slice(0, 10)
			]
				.map((v) => `"${String(v).replace(/"/g, '""')}"`)
				.join(',')
		);
		const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head>
	<title>Leads · CRM · PreceptorFISIC</title>
</svelte:head>

<div class="leads-page">
	<header class="leads-header">
		<div>
			<h1 class="leads-h1">Leads</h1>
			<p class="leads-sub">{filtered.length} de {total} leads no funil</p>
		</div>
		<div style="display:flex;gap:10px;align-items:center">
			<Button variant="secondary" onclick={exportCsv} disabled={filtered.length === 0}>
				↓ Exportar CSV
			</Button>
			<Button onclick={() => goto('/crm/novo')}>+ Novo lead</Button>
		</div>
	</header>

	<div class="tbl-filters">
		<div class="tbl-search">
			<span style="color:var(--ink-3)">⌕</span>
			<input bind:value={filterQuery} placeholder="Buscar nome, email, telefone, notas…" />
		</div>
		<select class="tbl-select" bind:value={filterSource} aria-label="Filtrar por origem">
			<option value="all">Todas as origens</option>
			{#each SOURCES as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
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
					<th>
						<button type="button" class="th-sort" onclick={() => toggleSort('name')}>
							Lead {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</button>
					</th>
					<th>Contato</th>
					<th>Estágio</th>
					<th>Origem</th>
					<th>
						<button type="button" class="th-sort" onclick={() => toggleSort('nextFollowUpAt')}>
							Follow-up {sortKey === 'nextFollowUpAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</button>
					</th>
					<th>
						<button type="button" class="th-sort" onclick={() => toggleSort('createdAt')}>
							Criado {sortKey === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
						</button>
					</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as lead (lead.id)}
					<tr class="crm-row">
						<td onclick={() => goto(`/crm/${lead.id}`)}>
							<div class="row-lead">
								<Avatar name={lead.name} size={32} />
								<span class="lead-name">{lead.name}</span>
							</div>
						</td>
						<td class="lead-contact" onclick={() => goto(`/crm/${lead.id}`)}>
							{#if lead.phone}<div class="num">{lead.phone}</div>{/if}
							{#if lead.email}<div class="lead-email">{lead.email}</div>{/if}
							{#if !lead.phone && !lead.email}<span style="color:var(--ink-3)">—</span>{/if}
						</td>
						<td>
							<!-- Select estilizado como pill: troca o estágio sem sair da lista -->
							<select
								class="stage-select"
								style="color:{stageColor(lead.stage)};border-color:color-mix(in srgb, {stageColor(
									lead.stage
								)} 25%, transparent)"
								value={lead.stage}
								onchange={(e) => changeStage(lead.id, e.currentTarget.value as LeadStage)}
							>
								{#each STAGES as st (st.id)}
									<option value={st.id}>{st.label}</option>
								{/each}
							</select>
						</td>
						<td class="lead-source" onclick={() => goto(`/crm/${lead.id}`)}>
							{sourceLabel(lead.source)}
						</td>
						<td
							class="num lead-follow"
							class:late={isLate(lead)}
							onclick={() => goto(`/crm/${lead.id}`)}
						>
							{isLate(lead) ? '⚠ ' : ''}{fmtDate(lead.nextFollowUpAt)}
						</td>
						<td class="num lead-date" onclick={() => goto(`/crm/${lead.id}`)}>
							{fmtDate(lead.createdAt)}
						</td>
						<td onclick={() => goto(`/crm/${lead.id}`)}><span class="row-arrow">→</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if filtered.length === 0}
			<div class="tbl-empty">Nenhum lead com esses filtros.</div>
		{/if}
	</div>
</div>

<style>
	.leads-page {
		padding: 28px 32px 64px;
		max-width: 1280px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.leads-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
	}
	.leads-h1 {
		font: 600 24px var(--font-sans);
		margin: 0;
		letter-spacing: -0.02em;
		color: var(--ink-0);
	}
	.leads-sub {
		font: var(--body-sm);
		color: var(--ink-2);
		margin: 4px 0 0;
	}
	.tbl-filters {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.tbl-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 38px;
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
	.tbl-select {
		height: 38px;
		padding: 0 12px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		color: var(--ink-1);
		font: var(--body-sm);
		cursor: pointer;
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
	.th-sort {
		all: unset;
		cursor: pointer;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}
	.th-sort:hover {
		color: var(--ink-0);
	}
	.crm-table tbody tr {
		border-top: 1px solid var(--ink-line);
		transition: background 140ms var(--ease);
	}
	.crm-table tbody tr:hover {
		background: var(--bg-2);
	}
	.crm-table tbody td {
		padding: 12px 14px;
		vertical-align: middle;
		overflow: hidden;
		font: var(--body-sm);
		color: var(--ink-1);
		cursor: pointer;
	}
	.col-nome { width: 22%; }
	.col-contato { width: 22%; }
	.col-stage { width: 16%; }
	.col-fonte { width: 11%; }
	.col-follow { width: 11%; }
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
	.lead-follow.late {
		color: var(--warn);
	}
	.stage-select {
		appearance: none;
		-webkit-appearance: none;
		padding: 4px 10px;
		border: 1px solid;
		border-radius: var(--r-pill);
		background: transparent;
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		max-width: 100%;
	}
	.stage-select option {
		background: var(--bg-1);
		color: var(--ink-0);
		text-transform: none;
	}
	.row-arrow {
		color: var(--accent);
		font-size: 16px;
	}
	.tbl-empty {
		padding: 32px;
		text-align: center;
		font: var(--body-sm);
		color: var(--ink-2);
		border-top: 1px solid var(--ink-line);
	}

	@media (max-width: 1023px) {
		.leads-page {
			padding: 16px 14px 32px;
		}
		.leads-header {
			flex-direction: column;
			align-items: stretch;
		}
		.crm-table-card {
			overflow-x: auto;
		}
		.crm-table {
			min-width: 860px;
		}
	}
</style>
