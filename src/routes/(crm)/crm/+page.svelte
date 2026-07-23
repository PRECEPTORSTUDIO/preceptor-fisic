<script lang="ts">
	import { Button, Avatar } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { LeadListItem, LeadStage, LeadSource } from '$lib/server/queries';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const leads = $derived(data.leads as LeadListItem[]);
	const counts = $derived(data.counts);

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

	const total = $derived(leads.length);
	const pagantesCount = $derived(counts.pagante);
	const conversionRate = $derived(total > 0 ? Math.round((pagantesCount / total) * 100) : 0);
	const greetDate = new Date().toLocaleDateString('pt-BR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
	const firstName = $derived(
		((data.professional?.name as string | undefined) ?? '').split(' ')[0] || 'time'
	);
	const novos7d = $derived(
		leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() < 7 * 86_400_000).length
	);
	/** Follow-ups vencidos de leads vivos — o "o que fazer hoje" do CRM. */
	const lateFollowUps = $derived(
		leads
			.filter(
				(l) =>
					l.nextFollowUpAt &&
					new Date(l.nextFollowUpAt).getTime() < Date.now() &&
					l.stage !== 'cancelado' &&
					l.stage !== 'perdido'
			)
			.sort(
				(a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime()
			)
	);
	const stageMax = $derived(Math.max(1, ...STAGES.map((s) => counts[s.id])));
	const sourceRows = $derived(
		SOURCES.map((s) => ({ ...s, n: leads.filter((l) => l.source === s.id).length }))
			.filter((r) => r.n > 0)
			.sort((a, b) => b.n - a.n)
	);
	const sourceMax = $derived(Math.max(1, ...sourceRows.map((r) => r.n)));
	const recent = $derived(
		[...leads]
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
			.slice(0, 8)
	);

	function stageOf(s: LeadStage): { id: LeadStage; label: string; color: string } {
		return STAGES.find((x) => x.id === s) ?? STAGES[0]!;
	}
	function fmtDate(d: Date | null): string {
		if (!d) return '—';
		return new Date(d)
			.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
			.replace('.', '');
	}
</script>

<svelte:head>
	<title>Visão geral · CRM · PreceptorFISIC</title>
</svelte:head>

<div class="crm-page">
	<header class="crm-header">
		<div style="min-width:0">
			<div class="crm-date">{greetDate}</div>
			<h1 class="crm-h1">Olá, {firstName}!</h1>
			<p class="crm-sub">Pipeline de leads do contato inicial até virar aluno ativo.</p>
		</div>
		<div class="crm-actions">
			<Button variant="secondary" onclick={() => goto('/crm/leads')}>Ver todos os leads</Button>
			<Button onclick={() => goto('/crm/novo')}>+ Novo lead</Button>
		</div>
	</header>

	<!-- ─── KPIs + gráficos (cards translúcidos sobre o glow) ─── -->
	<section class="dash">
		<div class="dash-glow" aria-hidden="true"></div>

		<div class="kpi-row">
			<div class="glass kpi">
				<div class="kpi-label">Leads no funil</div>
				<div class="num kpi-num">{total}</div>
			</div>
			<div class="glass kpi">
				<div class="kpi-label">Novos · 7 dias</div>
				<div class="num kpi-num">{novos7d}</div>
			</div>
			<div class="glass kpi">
				<div class="kpi-label">Pagantes</div>
				<div style="display:flex;align-items:baseline;gap:8px">
					<div class="num kpi-num">{pagantesCount}</div>
					<div class="kpi-sub">{conversionRate}% do funil</div>
				</div>
			</div>
			<div class="glass kpi" class:kpi--alert={lateFollowUps.length > 0}>
				<div class="kpi-label">Follow-ups atrasados</div>
				<div class="num kpi-num">{lateFollowUps.length}</div>
			</div>
		</div>

		<div class="chart-grid">
			<div class="glass chart-card">
				<div class="chart-title">Leads por estágio</div>
				{#each STAGES as st (st.id)}
					{@const n = counts[st.id]}
					<div class="bar-row" title="{st.label}: {n} {n === 1 ? 'lead' : 'leads'}">
						<span class="bar-label">{st.label}</span>
						<div class="bar-track">
							<div class="bar-fill" style="width:{(n / stageMax) * 100}%;background:{st.color}"></div>
						</div>
						<span class="num bar-val">{n}</span>
					</div>
				{/each}
			</div>

			<div class="glass chart-card">
				<div class="chart-title">Leads por origem</div>
				{#if sourceRows.length === 0}
					<p class="chart-empty">Sem leads ainda — as origens aparecem aqui.</p>
				{:else}
					{#each sourceRows as r (r.id)}
						<div class="bar-row" title="{r.label}: {r.n} {r.n === 1 ? 'lead' : 'leads'}">
							<span class="bar-label">{r.label}</span>
							<div class="bar-track">
								<div
									class="bar-fill"
									style="width:{(r.n / sourceMax) * 100}%;background:var(--accent)"
								></div>
							</div>
							<span class="num bar-val">{r.n}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</section>

	<!-- ─── O que fazer hoje + últimos leads ─── -->
	<div class="two-col">
		<section class="card panel">
			<div class="panel-head">
				<div class="panel-title">Follow-ups atrasados</div>
				<span class="num panel-count" class:warn={lateFollowUps.length > 0}>
					{lateFollowUps.length}
				</span>
			</div>
			{#if lateFollowUps.length === 0}
				<p class="panel-empty">Nada atrasado. Funil em dia. ✓</p>
			{:else}
				{#each lateFollowUps.slice(0, 6) as lead (lead.id)}
					{@const st = stageOf(lead.stage)}
					<button type="button" class="panel-row" onclick={() => goto(`/crm/${lead.id}`)}>
						<Avatar name={lead.name} size={28} />
						<div class="panel-row-main">
							<div class="panel-row-name">{lead.name}</div>
							<div class="panel-row-meta">
								<span style="color:{st.color}">● {st.label}</span>
								· venceu {fmtDate(lead.nextFollowUpAt)}
							</div>
						</div>
						<span class="row-arrow">→</span>
					</button>
				{/each}
			{/if}
		</section>

		<section class="card panel">
			<div class="panel-head">
				<div class="panel-title">Últimos leads</div>
				<a href="/crm/leads" class="panel-link">ver todos →</a>
			</div>
			{#if recent.length === 0}
				<p class="panel-empty">Nenhum lead ainda.</p>
			{:else}
				{#each recent as lead (lead.id)}
					{@const st = stageOf(lead.stage)}
					<button type="button" class="panel-row" onclick={() => goto(`/crm/${lead.id}`)}>
						<Avatar name={lead.name} size={28} />
						<div class="panel-row-main">
							<div class="panel-row-name">{lead.name}</div>
							<div class="panel-row-meta">
								<span style="color:{st.color}">● {st.label}</span>
								{#if lead.email}· {lead.email}{/if}
							</div>
						</div>
						<span class="num panel-row-date">{fmtDate(lead.createdAt)}</span>
					</button>
				{/each}
			{/if}
		</section>
	</div>
</div>

<style>
	.crm-page {
		padding: 28px 32px 64px;
		max-width: 1280px;
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
	.crm-date {
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.crm-h1 {
		font: 600 28px var(--font-sans);
		margin: 8px 0 0;
		letter-spacing: -0.025em;
		color: var(--ink-0);
	}
	.crm-sub {
		font: 400 14px var(--font-sans);
		color: var(--ink-2);
		margin: 6px 0 0;
	}
	.crm-actions {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-shrink: 0;
	}

	/* ─── Dashboard ─── */
	.dash {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		isolation: isolate;
	}
	.dash-glow {
		position: absolute;
		inset: -40px -80px;
		background:
			radial-gradient(ellipse 55% 70% at 22% 30%, var(--accent-glow) 0%, transparent 65%),
			radial-gradient(ellipse 45% 60% at 85% 75%, rgba(96, 165, 250, 0.07) 0%, transparent 70%);
		z-index: -1;
		pointer-events: none;
	}
	.glass {
		background: color-mix(in srgb, var(--bg-1) 78%, transparent);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	.kpi {
		padding: 16px 18px 14px;
	}
	.kpi-label {
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 8px;
	}
	.kpi-num {
		font: 600 30px var(--font-mono);
		color: var(--ink-0);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.kpi-sub {
		font: var(--label-mono);
		color: var(--ink-3);
	}
	.kpi--alert .kpi-num {
		color: var(--warn);
	}
	.chart-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.chart-card {
		padding: 18px 20px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chart-title {
		font: 500 14px var(--font-sans);
		color: var(--ink-0);
		letter-spacing: -0.01em;
		margin-bottom: 6px;
	}
	.chart-empty {
		font: var(--body-sm);
		color: var(--ink-3);
		margin: 0;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 110px 1fr 36px;
		align-items: center;
		gap: 10px;
	}
	.bar-label {
		font: 400 12.5px var(--font-sans);
		color: var(--ink-1);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bar-track {
		height: 10px;
		border-radius: 0 4px 4px 0;
		background: color-mix(in srgb, var(--ink-line) 55%, transparent);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 0 4px 4px 0;
		min-width: 2px;
		transition: width 300ms var(--ease);
	}
	.bar-val {
		font: 500 12.5px var(--font-mono);
		color: var(--ink-1);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* ─── Painéis (follow-ups + últimos leads) ─── */
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.panel {
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.panel-title {
		font: 500 14px var(--font-sans);
		color: var(--ink-0);
	}
	.panel-count {
		font: 500 12.5px var(--font-mono);
		color: var(--ink-3);
		padding: 2px 10px;
		background: var(--bg-2);
		border-radius: var(--r-pill);
	}
	.panel-count.warn {
		color: var(--warn);
	}
	.panel-link {
		font: 500 12.5px var(--font-sans);
		color: var(--accent);
		text-decoration: none;
	}
	.panel-empty {
		font: var(--body-sm);
		color: var(--ink-3);
		margin: 8px 0;
	}
	.panel-row {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--r-2);
		transition: background 140ms var(--ease);
	}
	.panel-row:hover {
		background: var(--bg-2);
	}
	.panel-row-main {
		flex: 1;
		min-width: 0;
	}
	.panel-row-name {
		font: 500 13.5px var(--font-sans);
		color: var(--ink-0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.panel-row-meta {
		font: var(--label-mono);
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.panel-row-date {
		font: var(--label-mono);
		color: var(--ink-3);
		flex-shrink: 0;
	}
	.row-arrow {
		color: var(--accent);
		font-size: 15px;
	}

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
		.kpi-row {
			grid-template-columns: repeat(2, 1fr);
		}
		.chart-grid,
		.two-col {
			grid-template-columns: 1fr;
		}
		.bar-row {
			grid-template-columns: 90px 1fr 32px;
		}
	}
</style>
