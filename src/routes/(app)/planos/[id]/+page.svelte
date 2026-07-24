<script lang="ts">
	import { Button, Chip, Eyebrow, toast } from '$lib/components/ui';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import { muscleGroupVolume } from '$lib/training-metrics';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const plan = $derived(data.plan);
	const planData = $derived(plan.planData);
	const sessions = $derived(planData.weekly_sessions ?? []);
	// Volume semanal por grupo muscular (séries/grupo) — métrica de balanço do plano.
	const muscleVolume = $derived(muscleGroupVolume(sessions));
	const maxMuscleSets = $derived(Math.max(1, ...muscleVolume.map((m) => m.sets)));
	const restrictions = $derived(planData.restrictions ?? []);
	const dbRestrictions = $derived((data.plan as any).dbRestrictions ?? []);
	const sourceMap = $derived(plan.sourceMap ?? {});
	const catalogMap = $derived(plan.catalogMap ?? {});

	// Vídeo aberto inline: chave "sessionIdx-blockKey-exerciseIdx".
	// Click no botão ▶ vídeo expande/colapsa abaixo da linha do exercício.
	let openVideoKey = $state<string | null>(null);
	function toggleVideo(key: string) {
		openVideoKey = openVideoKey === key ? null : key;
	}

	// #M14 — revisão exibe os 3 blocos da sessão (warmup/main/cooldown), não só main.
	const BLOCKS = [
		['warmup', 'Aquecimento'],
		['main', 'Principal'],
		['cooldown', 'Volta à calma']
	] as const;

	// #5 — edição de exercício pelo profissional (inline).
	let editKey = $state<string | null>(null);
	let savingEdit = $state(false);
	function toggleEdit(key: string) {
		editKey = editKey === key ? null : key;
		if (editKey) pickerFor = null;
	}

	// Trocar / adicionar exercício do catálogo (seletor com busca).
	type PlanExercisePartial = { name?: string; muscle_groups?: string[] | null };
	type CatalogHit = {
		id: string;
		externalId: string;
		name: string;
		bodyPart: string;
		targetMuscle: string;
		equipment: string | null;
		difficulty: string | null;
		hasVideo: boolean;
	};
	// pickerFor identifica onde o seletor está aberto: sessão i, bloco, e ou o
	// índice do exercício a trocar (mode 'swap') ou o bloco pra adicionar ('add').
	let pickerFor = $state<{ i: number; block: string; j: number; mode: 'swap' | 'add' } | null>(null);
	let pickerQuery = $state('');
	let pickerResults = $state<CatalogHit[]>([]);
	let pickerLoading = $state(false);
	let pickerSelected = $state<CatalogHit | null>(null);
	let keepPrescription = $state(true);
	let swapping = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function pickerKey(i: number, block: string, j: number, mode: 'swap' | 'add') {
		return `${i}-${block}-${j}-${mode}`;
	}
	function isPickerOpen(i: number, block: string, j: number, mode: 'swap' | 'add') {
		return (
			pickerFor?.i === i &&
			pickerFor?.block === block &&
			pickerFor?.j === j &&
			pickerFor?.mode === mode
		);
	}
	// Termo inicial da busca ao abrir o seletor. No "trocar", já filtra pelo
	// grupo muscular do exercício atual — sem isso a busca vazia devolvia o
	// catálogo em ordem alfabética (só "abdominal…") independente do exercício.
	function seedFor(mode: 'swap' | 'add', ex?: PlanExercisePartial): string {
		if (mode !== 'swap' || !ex) return '';
		const mg = (ex.muscle_groups ?? []).map((s) => String(s).trim()).filter(Boolean);
		// 1º token do 1º grupo muscular (ex.: "bíceps braquial" → "bíceps").
		if (mg.length > 0) return mg[0]?.split(/[\s,/]+/)[0] ?? '';
		// Sem grupo: 1ª palavra significativa do nome (ex.: "Rosca bíceps" → "Rosca").
		return (ex.name ?? '').trim().split(/[\s,]+/)[0] ?? '';
	}
	function openPicker(i: number, block: string, j: number, mode: 'swap' | 'add', ex?: PlanExercisePartial) {
		if (isPickerOpen(i, block, j, mode)) {
			pickerFor = null;
			return;
		}
		editKey = null;
		pickerFor = { i, block, j, mode };
		pickerQuery = seedFor(mode, ex);
		pickerResults = [];
		pickerSelected = null;
		keepPrescription = true;
		void runSearch();
	}
	async function runSearch() {
		pickerLoading = true;
		try {
			const r = await fetch(`/planos/${plan.id}/catalogo?q=${encodeURIComponent(pickerQuery)}`);
			if (r.ok) {
				const body = (await r.json()) as { items: CatalogHit[] };
				pickerResults = body.items ?? [];
			}
		} catch {
			// silencioso — mantém resultados anteriores
		} finally {
			pickerLoading = false;
		}
	}
	function onPickerInput() {
		pickerSelected = null;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void runSearch(), 250);
	}
	const DIFF_PT: Record<string, string> = {
		beginner: 'iniciante',
		intermediate: 'intermediário',
		advanced: 'avançado'
	};
	const PICKER_ITEM_BASE =
		'all:unset;cursor:pointer;box-sizing:border-box;width:100%;display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-bottom:1px solid var(--ink-line);text-align:left;';
	function pickerItemStyle(selected: boolean) {
		return selected
			? PICKER_ITEM_BASE + 'background:var(--accent-wash);box-shadow:inset 3px 0 0 var(--accent)'
			: PICKER_ITEM_BASE;
	}

	// Handler comum de resultado de swap/add/remove: toast + fecha + revalida UI.
	function exerciseMutationHandler(closeAfter: () => void) {
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			swapping = false;
			savingEdit = false;
			if (result.type === 'success') {
				const v = result.data?.validation;
				const n = (v?.violations as number) ?? 0;
				const nm = result.data?.newName ? ` · ${result.data.newName}` : '';
				if (v && n > 0)
					toast.warn(`Plano atualizado${nm} · ${n} violaç${n === 1 ? 'ão' : 'ões'} clínica${n === 1 ? '' : 's'}.`);
				else toast.success(`Plano atualizado${nm}.`);
				closeAfter();
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(String(result.data?.error ?? 'Não foi possível atualizar.'));
			} else {
				await update();
			}
		};
	}
	onDestroy(() => clearTimeout(searchTimer));

	type SrcRef = {
		type?: string;
		chunk_id?: string;
		source_id?: string;
		rule_code?: string;
		note?: string;
	};

	function citationLabel(ref: SrcRef | null | undefined): string {
		if (!ref) return '';
		if (ref.type === 'rule' && ref.rule_code) return `Regra ${ref.rule_code}`;
		const key = ref.chunk_id ?? ref.source_id;
		if (key && sourceMap[key]) {
			const s = sourceMap[key];
			const org = s.organization.toUpperCase();
			const yr = s.year ? `, ${s.year}` : '';
			const pg = s.pageNumber ? ` · p.${s.pageNumber}` : '';
			return `${org}${yr}${pg} — ${s.title.length > 60 ? s.title.slice(0, 60) + '…' : s.title}`;
		}
		if (ref.note) return ref.note;
		if (ref.type === 'rag_chunk') return 'Diretriz clínica';
		if (ref.type === 'inference') return 'Inferência clínica';
		return '';
	}

	function citationBadge(ref: SrcRef | null | undefined): string {
		if (!ref) return '·';
		if (ref.type === 'rule') return '▢ regra';
		const key = ref.chunk_id ?? ref.source_id;
		if (key && sourceMap[key]) return '★';
		if (ref.type === 'inference') return '○';
		return '·';
	}

	const isGenerating = $derived(plan.status === 'pending' || plan.status === 'generating');
	const hasFailed = $derived(plan.status === 'failed');
	const isGenerated = $derived(plan.status === 'generated');
	const isPublished = $derived(plan.status === 'published');
	const isArchived = $derived(plan.status === 'archived');

	// resolved_* vive no JSON mas não no tipo PlanRestriction — leitura via cast.
	type Resolvable = { resolved_at?: string; resolved_by?: string; resolution?: string };
	// Espelha o gate do servidor (publishPlan): red RESOLVIDA não bloqueia.
	const redCount = $derived(
		restrictions.filter((r) => r.level === 'red' && !(r as Resolvable).resolved_at).length
	);
	const canPublish = $derived(isGenerated && redCount === 0);

	// Label PT-BR do status (evita 'Generated'/'Published' cru na UI).
	function planStatusLabel(s: string): string {
		return (
			(
				{
					pending: 'Na fila',
					generating: 'Gerando…',
					generated: 'Rascunho',
					published: 'Publicado',
					failed: 'Falhou',
					archived: 'Arquivado'
				} as Record<string, string>
			)[s] ?? s
		);
	}

	let publishing = $state(false);
	let deleting = $state(false);
	// Índice da restrição sendo liberada (override clínico #C02).
	let resolvingIdx = $state<number | null>(null);

	type PartialEx = { name?: string; reps?: string; sets?: number; load_guidance?: string };
	type PartialPlan = {
		summary?: string;
		weekly_sessions?: Array<{
			label?: string;
			focus?: string;
			duration_minutes?: number;
			warmup?: PartialEx[];
			main?: PartialEx[];
			cooldown?: PartialEx[];
		}>;
		restrictions?: Array<{ level?: string; title?: string; description?: string }>;
		monitoring_parameters?: Array<{ parameter?: string; frequency?: string }>;
	};

	type StatusResp = {
		id: string;
		status: string;
		progress: number;
		phase: string | null;
		error: string | null;
		generated: boolean;
		failed: boolean;
		partial: PartialPlan | null;
		streamText: string | null;
	};

	let livePhase = $state(plan.status === 'pending' ? 'enfileirado' : 'iniciando…');
	let liveProgress = $state(5);
	let livePartial = $state<PartialPlan | null>(null);
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (!isGenerating) {
			if (pollInterval) clearInterval(pollInterval);
			return;
		}
		const tick = async () => {
			try {
				const r = await fetch(`/planos/${plan.id}/status`);
				if (!r.ok) return;
				const s = (await r.json()) as StatusResp;
				livePhase = s.phase ?? livePhase;
				liveProgress = s.progress;
				livePartial = s.partial;
				if (s.generated || s.failed) {
					if (pollInterval) clearInterval(pollInterval);
					await invalidateAll();
				}
			} catch {
				// ignora — tenta de novo
			}
		};
		tick();
		// 800ms = ~3 atualizações por segundo. textStream do backend grava
		// a cada 180ms, então cada poll pega ~4 deltas de texto novos.
		pollInterval = setInterval(tick, 800);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});

	function levelColor(l: 'red' | 'yellow' | 'green') {
		return l === 'red' ? 'var(--danger)' : l === 'yellow' ? 'var(--warn)' : 'var(--success)';
	}
	function levelBg(l: 'red' | 'yellow' | 'green') {
		return l === 'red' ? 'var(--danger-dim)' : l === 'yellow' ? 'var(--warn-dim)' : 'var(--success-dim)';
	}
	function levelLabel(l: 'red' | 'yellow' | 'green') {
		return l === 'red' ? 'CRÍTICO' : l === 'yellow' ? 'CUIDADO' : 'OK';
	}
</script>

<svelte:head>
	<title>Plano · {plan.studentName} · PreceptorFISIC</title>
</svelte:head>

{#if isGenerating}
	<div class="gen-shell">
		<div class="gen-frame">
			<!-- Header com progresso -->
			<div class="gen-header">
				<div style="display:flex;align-items:center;gap:14px">
					<div style="position:relative;width:36px;height:36px">
						<div class="spinner-gen"></div>
					</div>
					<div>
						<div class="eyebrow" style="margin-bottom:2px">{plan.studentName}</div>
						<div style="font:500 16px var(--font-sans);color:var(--ink-0)">
							Gerando plano com PreceptorFISIC
						</div>
					</div>
				</div>
				<div style="text-align:right">
					<div class="num" style="font:600 24px var(--font-mono);color:var(--accent);line-height:1">
						{liveProgress}%
					</div>
					<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">
						PreceptorFISIC · ACSM ★
					</div>
				</div>
			</div>

			<!-- Progress bar -->
			<div class="gen-progress-wrap">
				<div class="gen-progress-bar" style="width:{liveProgress}%"></div>
			</div>

			<div class="gen-phase">
				<span class="gen-phase-dot"></span>
				{livePhase}
			</div>

			<!-- Plano materializando ao vivo — no mesmo formato do plano final -->
			{#if livePartial}
				<div class="gen-live">
					{#if livePartial.summary}
						<div class="gen-block gen-fade">
							<div class="eyebrow" style="margin-bottom:8px">◆ Resumo clínico</div>
							<p class="gen-summary">{livePartial.summary}</p>
						</div>
					{/if}

					{#if livePartial.restrictions && livePartial.restrictions.length > 0}
						<div class="gen-block gen-fade">
							<div class="eyebrow" style="margin-bottom:10px">
								⚠ Restrições · {livePartial.restrictions.length}
							</div>
							<div style="display:flex;flex-direction:column;gap:6px">
								{#each livePartial.restrictions as r, i (i)}
									{#if r.title}
										<div
											class="gen-restriction"
											style="border-left-color:{levelColor((r.level as 'red' | 'yellow' | 'green') ?? 'green')}"
										>
											<span
												style="font:var(--label-mono);color:{levelColor((r.level as 'red' | 'yellow' | 'green') ?? 'green')};text-transform:uppercase"
												>{levelLabel((r.level as 'red' | 'yellow' | 'green') ?? 'green')}</span
											>
											<span style="font:500 13px var(--font-sans);color:var(--ink-0)"
												>{r.title}</span
											>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					{#if livePartial.weekly_sessions && livePartial.weekly_sessions.length > 0}
						<div class="gen-block gen-fade">
							<div class="eyebrow" style="margin-bottom:10px">
								◐ Sessões · {livePartial.weekly_sessions.length}
							</div>
							<div style="display:flex;flex-direction:column;gap:8px">
								{#each livePartial.weekly_sessions as s, si (si)}
									{#if s.label}
										<div class="gen-session">
											<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
												<div style="font:500 14px var(--font-sans);color:var(--ink-0)">
													{s.label}
												</div>
												{#if s.duration_minutes}
													<div class="num" style="font:var(--label-mono);color:var(--ink-3)">
														{s.duration_minutes} min
													</div>
												{/if}
											</div>
											{#if s.focus}
												<div style="font:var(--body-sm);color:var(--ink-2);margin-bottom:8px">
													{s.focus}
												</div>
											{/if}
											{#each [{ label: 'Aquecimento', items: s.warmup }, { label: 'Principal', items: s.main }, { label: 'Volta à calma', items: s.cooldown }] as bloco (bloco.label)}
												{#if bloco.items && bloco.items.length > 0}
													<div style="margin-top:8px">
														<div
															style="font:var(--label-mono);color:var(--ink-3);text-transform:uppercase;margin-bottom:4px"
														>
															{bloco.label}
														</div>
														<div style="display:flex;flex-direction:column;gap:4px">
															{#each bloco.items as ex, ei (ei)}
																{#if ex.name}
																	<div class="gen-ex">
																		<span style="color:var(--accent)">·</span>
																		<span
																			style="flex:1;font:400 13px var(--font-sans);color:var(--ink-1)"
																			>{ex.name}</span
																		>
																		{#if ex.sets && ex.reps}
																			<span class="num" style="font:var(--label-mono);color:var(--ink-3)">
																				{ex.sets}×{ex.reps}
																			</span>
																		{/if}
																	</div>
																{/if}
															{/each}
														</div>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					{#if livePartial.monitoring_parameters && livePartial.monitoring_parameters.length > 0}
						<div class="gen-block gen-fade">
							<div class="eyebrow" style="margin-bottom:10px">
								◈ Monitoramento · {livePartial.monitoring_parameters.length}
							</div>
							<div style="display:flex;flex-direction:column;gap:6px">
								{#each livePartial.monitoring_parameters as m, i (i)}
									{#if m.parameter}
										<div class="gen-monit">
											<span style="font:500 13px var(--font-sans);color:var(--ink-0)"
												>{m.parameter}</span
											>
											{#if m.frequency}
												<span style="font:var(--body-sm);color:var(--ink-2)">{m.frequency}</span>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Estado inicial: ainda nada chegou -->
				<div class="gen-skel">
					<div class="gen-skel-line" style="width:60%"></div>
					<div class="gen-skel-line" style="width:85%"></div>
					<div class="gen-skel-line" style="width:45%"></div>
				</div>
			{/if}

			<div class="gen-footnote">
				<span style="color:var(--accent)">★</span>
				Pode levar de 30s a alguns minutos · Plano completa automaticamente
			</div>
		</div>
	</div>

	<style>
		.edit-lbl {
			display: block;
			font: 500 11px var(--font-sans);
			color: var(--ink-2);
			margin-bottom: 4px;
		}
		.edit-in {
			width: 100%;
			box-sizing: border-box;
			background: var(--bg-2);
			border: 1px solid var(--ink-line);
			border-radius: var(--r-1);
			padding: 8px 10px;
			font: 400 13px var(--font-sans);
			color: var(--ink-0);
			outline: none;
			resize: vertical;
		}
		.edit-in:focus {
			border-color: var(--accent);
		}
		/* Adicionar exercício — botão discreto no fim de cada bloco */
		.add-btn {
			all: unset;
			cursor: pointer;
			font: 500 12px var(--font-mono);
			letter-spacing: 0.04em;
			color: var(--accent);
			padding: 4px 10px;
			border: 1px dashed var(--ink-line-2);
			border-radius: var(--r-pill);
		}
		.add-btn:hover {
			background: var(--accent-wash);
		}
		/* NB: os estilos do seletor de catálogo (trocar/adicionar) são inline no
		   snippet exercisePicker — CSS scoped não alcança conteúdo de {@render}. */
		.gen-shell {
			flex: 1;
			background: var(--bg-0);
			display: flex;
			justify-content: center;
			padding: 32px 20px 80px;
		}
		.gen-frame {
			width: 100%;
			max-width: 760px;
			display: flex;
			flex-direction: column;
		}
		.gen-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--ink-line);
			margin-bottom: 14px;
		}
		.gen-progress-wrap {
			height: 4px;
			border-radius: 2px;
			background: var(--ink-line);
			overflow: hidden;
		}
		.gen-progress-bar {
			height: 100%;
			background: linear-gradient(90deg, var(--accent), var(--accent-2));
			box-shadow: 0 0 12px var(--accent-glow);
			transition: width 600ms var(--ease);
		}
		.gen-phase {
			margin-top: 12px;
			font: var(--label-mono);
			color: var(--accent-2);
			text-transform: uppercase;
			letter-spacing: 0.06em;
			display: flex;
			align-items: center;
			gap: 8px;
			min-height: 14px;
		}
		.gen-phase-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--accent);
			box-shadow: 0 0 6px var(--accent);
			animation: gen-pulse 1.4s ease-in-out infinite;
		}
		@keyframes gen-pulse {
			0%, 100% {
				opacity: 0.4;
			}
			50% {
				opacity: 1;
			}
		}
		.gen-live {
			display: flex;
			flex-direction: column;
			gap: 18px;
			margin-top: 28px;
		}
		.gen-block {
			background: var(--bg-1);
			border: 1px solid var(--ink-line);
			border-radius: var(--r-2);
			padding: 18px 20px;
		}

		.gen-fade {
			animation: gen-in 240ms var(--ease) backwards;
		}
		@keyframes gen-in {
			from {
				opacity: 0;
				transform: translateY(4px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
		.gen-summary {
			font: 400 14px/1.55 var(--font-sans);
			color: var(--ink-1);
			margin: 0;
		}
		.gen-restriction {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			background: var(--bg-2);
			border-left: 3px solid var(--ink-line);
			border-radius: var(--r-2);
		}
		.gen-session {
			padding: 14px;
			background: var(--bg-2);
			border: 1px solid var(--ink-line);
			border-radius: var(--r-2);
			animation: gen-in 280ms var(--ease) backwards;
		}
		.gen-ex {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 4px 0;
		}
		.gen-monit {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			padding: 8px 12px;
			background: var(--bg-2);
			border-radius: var(--r-2);
		}
		.gen-skel {
			margin-top: 28px;
			padding: 24px;
			background: var(--bg-1);
			border: 1px solid var(--ink-line);
			border-radius: var(--r-2);
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		.gen-skel-line {
			height: 10px;
			border-radius: 5px;
			background: linear-gradient(
				90deg,
				var(--ink-line) 0%,
				var(--ink-line-2) 50%,
				var(--ink-line) 100%
			);
			background-size: 200% 100%;
			animation: gen-shimmer 1.4s ease-in-out infinite;
		}
		@keyframes gen-shimmer {
			0% {
				background-position: -100% 0;
			}
			100% {
				background-position: 200% 0;
			}
		}
		.gen-footnote {
			margin-top: 28px;
			text-align: center;
			font: var(--label-mono);
			color: var(--ink-3);
			padding-top: 18px;
			border-top: 1px solid var(--ink-line);
			display: flex;
			justify-content: center;
			align-items: center;
			gap: 8px;
		}
		.spinner-gen {
			position: absolute;
			inset: 0;
			border-radius: 50%;
			border: 2px solid var(--ink-line);
			border-top-color: var(--accent);
			animation: spin-gen 0.9s linear infinite;
		}
		@keyframes spin-gen {
			to {
				transform: rotate(360deg);
			}
		}
		/* ═══════════════════════════════════════════════
		   Mobile refactor — modo visualização do plano
		   Sobrescreve inline styles via !important onde
		   necessário pra caber em telas pequenas.
		   ═══════════════════════════════════════════════ */
		@media (max-width: 1023px) {
			.pd-header {
				padding: 12px 14px !important;
				flex-wrap: wrap;
				gap: 10px;
			}
			.pd-header h1 {
				font-size: 15px !important;
				max-width: none !important;
			}
			.pd-header-actions {
				flex-wrap: wrap;
				gap: 6px !important;
				width: 100%;
			}
			.pd-header-actions :global(.pf-btn) {
				flex: 1;
				min-width: 0;
				font-size: 12px;
				padding: 6px 10px;
			}
			.pd-body {
				padding: 14px 14px 48px !important;
			}
			.pd-resumo-stats {
				grid-template-columns: 1fr 1fr !important;
			}
			.pd-body :global(.card) {
				padding: 16px !important;
			}
			/* O bloco "gerando" (gen-shell) já é estreito, mas reduz padding */
			.gen-shell {
				padding: 16px 12px 48px !important;
			}
			.gen-frame {
				gap: 16px;
			}
		}
	</style>
{:else if hasFailed}
	<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-0);min-height:80vh">
		<div style="display:flex;flex-direction:column;align-items:center;gap:18px;max-width:480px;text-align:center">
			<div
				style="width:64px;height:64px;border-radius:50%;background:var(--danger-dim);display:flex;align-items:center;justify-content:center;color:var(--danger);font-size:28px"
			>✗</div>
			<div>
				<h1 style="font:500 22px var(--font-sans);margin:0 0 8px;color:var(--ink-0)">Geração falhou</h1>
				<div style="font:var(--body-sm);color:var(--ink-2)">O PreceptorFISIC não conseguiu produzir um plano válido. Tente novamente.</div>
			</div>
			<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
				<Button onclick={() => goto(`/alunos/${plan.studentId}/gerar`)}>↻ Tentar de novo</Button>
				<form
					method="POST"
					action="?/delete"
					use:enhance={({ cancel }) => {
						if (!window.confirm('Excluir este plano com falha? Isso não pode ser desfeito.')) {
							cancel();
							return;
						}
						deleting = true;
						return async ({ update, result }) => {
							deleting = false;
							if (result.type === 'failure') {
								toast.error(String((result.data as any)?.error ?? 'Não foi possível excluir.'));
							}
							await update();
						};
					}}
				>
					<Button variant="secondary" type="submit" disabled={deleting}>
						{deleting ? 'Excluindo…' : 'Excluir plano'}
					</Button>
				</form>
			</div>
		</div>
	</div>
{:else}

<div class="pd-page" style="flex:1;overflow-y:auto;background:var(--bg-0)">
	<header
		class="pd-header"
		style="display:flex;align-items:center;justify-content:space-between;padding:20px 32px;border-bottom:1px solid var(--ink-line);background:var(--bg-1);position:sticky;top:0;z-index:10"
	>
		<div style="display:flex;align-items:center;gap:10px;min-width:0">
			<button
				onclick={() => goto(`/alunos/${plan.studentId}`)}
				style="background:var(--bg-2);border:1px solid var(--ink-line-2);cursor:pointer;width:32px;height:32px;border-radius:8px;color:var(--ink-1);flex-shrink:0"
			>←</button>
			<div style="min-width:0">
				<div class="eyebrow" style="margin-bottom:4px">{plan.studentName}</div>
				<h1 style="margin:0;font:600 18px var(--font-sans);letter-spacing:-0.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:600px">
					Plano · {new Date(plan.createdAt).toLocaleDateString('pt-BR')}
				</h1>
			</div>
		</div>
		<div class="pd-header-actions" style="display:flex;gap:8px;flex-shrink:0;align-items:center">
			{#if isGenerated}
				<form
					method="POST"
					action="?/publish"
					use:enhance={() => {
						publishing = true;
						return async ({ update, result }) => {
							await update();
							publishing = false;
							if (result.type === 'success') {
								toast.success('Plano publicado · agora visível pro aluno.');
							} else if (result.type === 'failure') {
								toast.error(String((result.data as any)?.error ?? 'Falha ao publicar.'));
							}
							await invalidateAll();
						};
					}}
					style="display:inline-flex;gap:8px"
				>
					{#if !canPublish && redCount > 0}
						<span
							style="font:var(--label-mono);color:var(--danger);padding:6px 10px;border:1px solid var(--danger);border-radius:var(--r-pill);background:var(--danger-dim)"
						>⚠ {redCount} {redCount > 1 ? 'restrições críticas' : 'restrição crítica'}</span>
					{/if}
					<Button type="submit" disabled={!canPublish || publishing}>
						{publishing ? 'Publicando…' : '✓ Publicar para o aluno'}
					</Button>
				</form>
			{:else if isPublished}
				<Chip variant="success">● Publicado</Chip>
				<form
					method="POST"
					action="?/archive"
					use:enhance={({ cancel }) => {
						if (!window.confirm('Arquivar este plano? O aluno perde o acesso a ele.')) {
							cancel();
							return;
						}
						return async ({ update, result }) => {
							await update();
							if (result.type === 'success') toast.info('Plano arquivado.');
							await invalidateAll();
						};
					}}
				>
					<Button variant="secondary" type="submit">Arquivar</Button>
				</form>
			{:else if isArchived}
				<Chip>○ Arquivado</Chip>
				<form
					method="POST"
					action="?/unarchive"
					use:enhance={() => async ({ update, result }) => {
						await update();
						if (result.type === 'success') {
							toast.success('Plano reativado · visível pro aluno novamente.');
						} else if (result.type === 'failure') {
							toast.error(String((result.data as any)?.error ?? 'Falha ao reativar.'));
						}
						await invalidateAll();
					}}
				>
					<Button variant="secondary" type="submit">Reativar</Button>
				</form>
			{/if}
			{#if !isGenerating && !hasFailed}
				<form
					method="POST"
					action="?/revalidate"
					use:enhance={() => async ({ update, result }) => {
						await update();
						if (result.type === 'success') {
							const v = (result.data as any)?.validation;
							const n = (v?.violations as number) ?? 0;
							if (n === 0) toast.success('Validação clínica · 0 violações detectadas.');
							else
								toast.warn(
									`${n} violaç${n === 1 ? 'ão' : 'ões'} clínica${n === 1 ? '' : 's'} encontrada${n === 1 ? '' : 's'}.`
								);
						}
						await invalidateAll();
					}}
				>
					<Button variant="secondary" type="submit" title="Re-checa contra clinical_rules">⟲ Re-validar</Button>
				</form>
			{/if}
			<Button variant="secondary" onclick={() => goto(`/planos/${plan.id}/imprimir`)}>⎙ Imprimir / PDF</Button>
				{#if !isGenerating}
					<!-- Excluir permanentemente — em qualquer estado (menos gerando). -->
					<form
						method="POST"
						action="?/delete"
						use:enhance={({ cancel }) => {
							const msg = isPublished
								? 'Excluir este plano? O aluno perde o acesso e o registro é apagado. Não dá pra desfazer.'
								: 'Excluir este plano de treino? Não dá pra desfazer.';
							if (!window.confirm(msg)) {
								cancel();
								return;
							}
							deleting = true;
							return async ({ update, result }) => {
								deleting = false;
								if (result.type === 'failure')
									toast.error(String((result.data as any)?.error ?? 'Não foi possível excluir.'));
								await update();
							};
						}}
					>
						<Button variant="ghost" type="submit" disabled={deleting} title="Excluir plano">
							{deleting ? 'Excluindo…' : '🗑 Excluir'}
						</Button>
					</form>
				{/if}
		</div>
	</header>

	{#if form?.error}
		<div
			style="padding:14px 32px;background:var(--danger-dim);border-bottom:1px solid var(--danger);color:var(--danger);font:var(--body-sm)"
		>⚠ {form.error}</div>
	{/if}
	{#if form?.success && (form as any).action === 'publish'}
		<div
			style="padding:14px 32px;background:var(--success-dim);border-bottom:1px solid var(--success);color:var(--success);font:var(--body-sm)"
		>✓ Plano publicado — agora visível pro aluno.</div>
	{/if}
	{#if form?.success && (form as any).action === 'revalidate'}
		{@const v = (form as any).validation}
		<div
			style="padding:14px 32px;background:var(--accent-wash);border-bottom:1px solid var(--accent);color:var(--ink-0);font:var(--body-sm)"
		>
			<span style="color:var(--accent)">⟲ Validação clínica concluída.</span>
			{v.violations} violação{v.violations === 1 ? '' : 'ões'} encontrada{v.violations === 1 ? '' : 's'}
			{#if v.violations > 0}· severidade: {Object.entries(v.bySeverity).map(([k, n]) => `${k}=${n}`).join(' · ')} · regras: {v.rules.join(', ')}{/if}
		</div>
	{/if}

	<div class="pd-body" style="padding:28px 32px 80px;max-width:1100px;margin:0 auto">
		<!-- Resumo -->
		<div class="card" style="padding:24px;margin-bottom:20px">
			<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:24px">
				<div style="flex:1;min-width:0">
					<Eyebrow>Resumo do plano</Eyebrow>
					<div style="font:var(--body);color:var(--ink-1);margin-top:6px;line-height:1.6">{planData.summary ?? 'Sem resumo.'}</div>
				</div>
				<Chip variant={plan.isActive ? 'success' : 'default'}>{plan.isActive ? '● Ativo' : 'Encerrado'}</Chip>
			</div>

			<div
				class="pd-resumo-stats"
				style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px;padding-top:18px;border-top:1px solid var(--ink-line)"
			>
				<div>
					<Eyebrow>Sessões / semana</Eyebrow>
					<div class="num" style="font:500 18px var(--font-mono);color:var(--ink-0);margin-top:4px">
						{sessions.length}
					</div>
				</div>
				<div>
					<Eyebrow>Status</Eyebrow>
					<div style="font:500 14px var(--font-sans);color:var(--ink-0);margin-top:6px">{planStatusLabel(plan.status)}</div>
				</div>
				<div>
					<Eyebrow>Gerado em</Eyebrow>
					<div class="num" style="font:500 13px var(--font-mono);color:var(--ink-1);margin-top:6px">
						{new Date(plan.createdAt).toLocaleDateString('pt-BR')}
					</div>
				</div>
			</div>
		</div>

		<!-- Restrições clínicas -->
		{#if restrictions.length > 0}
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin:20px 0 14px">Restrições e cuidados clínicos</div>
			<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
				{#each restrictions as r, i (r.title + i)}
					{@const resolved = (r as Resolvable).resolved_at}
					<div
						class="card"
						style="padding:18px;background:{levelBg(r.level)};border:1px solid {levelColor(r.level)};border-left:4px solid {levelColor(r.level)}{resolved
							? ';opacity:0.6'
							: ''}"
					>
						<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
							<span
								style="font:var(--label-mono);color:{levelColor(r.level)};text-transform:uppercase;letter-spacing:0.08em;padding:2px 8px;background:rgba(0,0,0,0.25);border-radius:var(--r-pill)"
								>{levelLabel(r.level)}</span
							>
							{#if resolved}
								<span
									style="font:var(--label-mono);color:var(--success);padding:2px 8px;border:1px solid var(--success);border-radius:var(--r-pill);background:var(--success-dim)"
									>✓ resolvida ({(r as Resolvable).resolution === 'dismissed'
										? 'dispensada'
										: 'responsabilidade assumida'}) em {new Date(resolved).toLocaleDateString('pt-BR')}</span
								>
							{/if}
							{#if citationLabel(r.source as SrcRef)}
								<span style="font:var(--label-mono);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px"
									>{citationBadge(r.source as SrcRef)} {citationLabel(r.source as SrcRef)}</span
								>
							{/if}
						</div>
						<div style="font:600 14px var(--font-sans);color:var(--ink-0);margin-bottom:6px">{r.title}</div>
						<div style="font:var(--body-sm);color:var(--ink-0);line-height:1.5;opacity:0.92">{r.description}</div>
						{#if (r.affected_exercises?.length ?? 0) > 0}
							<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
								{#each r.affected_exercises as ex (ex)}
									<span
										style="font:var(--label-mono);padding:3px 8px;border-radius:var(--r-pill);background:rgba(0,0,0,0.3);color:var(--ink-1)"
										>{ex}</span
									>
								{/each}
							</div>
						{/if}
						{#if r.source && (r.source.chunk_id || r.source.source_id) && sourceMap[r.source.chunk_id ?? r.source.source_id ?? '']}
							{@const src = sourceMap[r.source.chunk_id ?? r.source.source_id ?? '']!}
							<details style="margin-top:12px">
								<summary
									style="cursor:pointer;font:var(--label-mono);color:var(--ink-2);user-select:none"
									>Ver trecho da diretriz</summary
								>
								<blockquote
									style="margin:8px 0 0;padding:10px 14px;border-left:2px solid {levelColor(r.level)};font:var(--body-sm);color:var(--ink-1);font-style:italic;line-height:1.5;background:rgba(0,0,0,0.2)"
									>"{src.excerpt ?? ''}{(src.excerpt?.length ?? 0) >= 280 ? '…' : ''}"</blockquote
								>
							</details>
						{/if}
						<!-- #C02 — override clínico: só em red não-resolvida de plano em rascunho -->
						{#if r.level === 'red' && !resolved && isGenerated}
							<form
								method="POST"
								action="?/resolveRestriction"
								use:enhance={({ cancel }) => {
									if (
										!window.confirm(
											'Assumir responsabilidade clínica por esta restrição e liberar a publicação do plano?'
										)
									) {
										cancel();
										return;
									}
									resolvingIdx = i;
									return async ({ update, result }) => {
										resolvingIdx = null;
										if (result.type === 'success') {
											toast.info('Restrição liberada sob responsabilidade do profissional.');
											await invalidateAll();
										} else if (result.type === 'failure') {
											toast.error(String((result.data as any)?.error ?? 'Falha ao liberar restrição.'));
										} else {
											await update();
										}
									};
								}}
								style="margin-top:14px;display:flex;justify-content:flex-end"
							>
								<input type="hidden" name="index" value={i} />
								<input type="hidden" name="resolution" value="overridden" />
								<Button variant="secondary" size="sm" type="submit" disabled={resolvingIdx === i}>
									{resolvingIdx === i ? 'Liberando…' : 'Assumir responsabilidade e liberar'}
								</Button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Volume semanal por grupo muscular (#4) -->
		{#if muscleVolume.length > 0}
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin:8px 0 14px">
				Volume semanal por grupo muscular
			</div>
			<div class="card" style="padding:16px 18px;margin-bottom:18px">
				<div style="display:flex;flex-direction:column;gap:10px">
					{#each muscleVolume as m (m.group)}
						<div style="display:flex;align-items:center;gap:12px">
							<div style="flex:0 0 130px;font:500 12.5px var(--font-sans);color:var(--ink-1);text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
								{m.group}
							</div>
							<div style="flex:1;height:8px;background:var(--bg-3);border-radius:var(--r-pill);overflow:hidden">
								<div style="height:100%;width:{Math.round((m.sets / maxMuscleSets) * 100)}%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:var(--r-pill)"></div>
							</div>
							<div style="flex:0 0 auto;font:500 11px var(--font-mono);color:var(--ink-2);font-variant-numeric:tabular-nums">
								{m.sets} {m.sets === 1 ? 'série' : 'séries'} · {m.exercises} {m.exercises === 1 ? 'ex' : 'ex'}
							</div>
						</div>
					{/each}
				</div>
				<div style="font:var(--label-mono);color:var(--ink-3);margin-top:12px">
					Σ séries por grupo muscular ao longo da semana — referência de volume (hipertrofia: ~10–20 séries/grupo/semana).
				</div>
			</div>
		{/if}

		<!-- Seletor de exercício do catálogo (trocar / adicionar) -->
		{#snippet exercisePicker(i: number, blockKey: string, j: number, mode: 'swap' | 'add')}
			<!-- Estilos inline de propósito: CSS scoped não chega no conteúdo
			     renderizado via {@render} deste snippet, então a estrutura precisa
			     ser inline pra não quebrar (busca virava texto corrido). -->
			<div
				style="padding:12px 20px 16px 60px;background:var(--bg-1);display:flex;flex-direction:column;gap:10px"
			>
				<input
					style="width:100%;box-sizing:border-box;background:var(--bg-2);border:1px solid var(--ink-line-2);border-radius:var(--r-2);padding:8px 12px;font:400 13px var(--font-sans);color:var(--ink-0);outline:none"
					placeholder="Buscar exercício no catálogo…"
					bind:value={pickerQuery}
					oninput={onPickerInput}
				/>
				{#if mode === 'swap'}
					<label
						style="display:flex;align-items:center;gap:8px;font:500 12px var(--font-sans);color:var(--ink-1);cursor:pointer"
					>
						<input type="checkbox" bind:checked={keepPrescription} /> manter séries · reps · descanso · intensidade
					</label>
				{/if}
				{#if pickerLoading && pickerResults.length === 0}
					<div style="font:400 12.5px var(--font-sans);color:var(--ink-3);padding:6px 2px">Buscando…</div>
				{:else if pickerResults.length === 0}
					<div style="font:400 12.5px var(--font-sans);color:var(--ink-3);padding:6px 2px">
						Nenhum exercício encontrado.
					</div>
				{:else}
					<div
						style="display:flex;flex-direction:column;max-height:280px;overflow-y:auto;border:1px solid var(--ink-line);border-radius:var(--r-2)"
					>
						{#each pickerResults as c (c.id)}
							<button
								type="button"
								onclick={() => (pickerSelected = c)}
								style={pickerItemStyle(pickerSelected?.id === c.id)}
							>
								<span style="font:500 13.5px var(--font-sans);color:var(--ink-0)">{c.name}</span>
								<span style="font:var(--label-mono);color:var(--ink-3);text-transform:capitalize"
									>{c.bodyPart}{c.equipment ? ' · ' + c.equipment : ''}{c.difficulty
										? ' · ' + (DIFF_PT[c.difficulty] ?? c.difficulty)
										: ''}{c.hasVideo ? ' · 🎬 vídeo' : ''}</span
								>
							</button>
						{/each}
					</div>
				{/if}
				{#if pickerSelected}
					<form
						method="POST"
						action="?/{mode === 'swap' ? 'swapExercise' : 'addExercise'}"
						use:enhance={() => {
							swapping = true;
							return exerciseMutationHandler(() => (pickerFor = null));
						}}
						style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;background:var(--accent-wash);border-radius:var(--r-2)"
					>
						<input type="hidden" name="sessionIdx" value={i} />
						<input type="hidden" name="block" value={blockKey} />
						{#if mode === 'swap'}<input type="hidden" name="exerciseIdx" value={j} />{/if}
						{#if mode === 'swap' && keepPrescription}<input type="hidden" name="keepPrescription" value="on" />{/if}
						<input type="hidden" name="catalogId" value={pickerSelected.id} />
						<span style="font:400 13px var(--font-sans);color:var(--ink-0)"
							>{mode === 'swap' ? 'Trocar por' : 'Adicionar'}: <strong>{pickerSelected.name}</strong></span
						>
						<div style="display:flex;gap:8px">
							<Button type="button" variant="ghost" size="sm" onclick={() => (pickerFor = null)}>Cancelar</Button>
							<Button type="submit" size="sm" disabled={swapping}>{swapping ? 'Salvando…' : 'Confirmar'}</Button>
						</div>
					</form>
				{/if}
			</div>
		{/snippet}

		<!-- Sessões de treino -->
		<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin:8px 0 14px">Sessões de treino</div>
		{#if sessions.length === 0}
			<div class="card" style="padding:32px;text-align:center;color:var(--ink-2)">
				Plano sem sessões definidas.
			</div>
		{:else}
			{#each sessions as s, i (i)}
				{@const firstBlock = BLOCKS.map((b) => b[0]).find((b) => (s[b]?.length ?? 0) > 0)}
				<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
					<button
						type="button"
						onclick={() => goto(`/planos/${plan.id}/sessoes/${i}`)}
						style="all:unset;cursor:pointer;width:100%;box-sizing:border-box;padding:16px 20px;border-bottom:1px solid var(--ink-line);background:var(--bg-1);display:flex;justify-content:space-between;align-items:center"
					>
						<div>
							<div style="font:500 15px var(--font-sans);color:var(--ink-0)">{s.label ?? `Sessão ${i + 1}`}</div>
							<div
								style="font:var(--label-mono);color:var(--ink-2);text-transform:uppercase;letter-spacing:0.08em;margin-top:3px"
							>{(s.warmup?.length ?? 0) + (s.main?.length ?? 0) + (s.cooldown?.length ?? 0)} exercícios{s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}{s.focus ? ` · ${s.focus}` : ''}</div>
						</div>
						<span style="color:var(--accent);font:500 13px var(--font-sans)">▶ Ver sessão</span>
					</button>

					{#each BLOCKS as [blockKey, blockLabel] (blockKey)}
					{#each (s[blockKey] ?? []) as ex, j (ex.name + j)}
						{@const catEntry = ex.catalog_id ? catalogMap[ex.catalog_id] : null}
						{@const videoKey = `${i}-${blockKey}-${j}`}
						{@const videoOpen = openVideoKey === videoKey}
						{@const editOpen = editKey === videoKey}
						{@const blockLen = (s[blockKey] ?? []).length}
						<div
							style="display:flex;flex-direction:column;{j || blockKey !== firstBlock ? 'border-top:1px solid var(--ink-line)' : ''}"
						>
							<div
								style="padding:14px 20px;display:grid;grid-template-columns:56px 1fr auto auto auto auto auto auto auto;gap:12px;align-items:center"
							>
								<div style="display:flex;align-items:center;gap:6px">
									{#if !isArchived && blockLen > 1}
										<!-- Setas de ordem. Movem SÓ dentro do próprio bloco: a action
										     recebe `block` e troca dentro daquele array, então aquecimento
										     nunca troca de lugar com treino principal. -->
										<div style="display:flex;flex-direction:column;gap:2px">
											{#each [['up', '▲', j === 0], ['down', '▼', j === blockLen - 1]] as [dir, glyph, disabled] (dir)}
												<form
													method="POST"
													action="?/reorderExercise"
													use:enhance={() => {
														savingEdit = true;
														return exerciseMutationHandler(() => {});
													}}
												>
													<input type="hidden" name="sessionIdx" value={i} />
													<input type="hidden" name="block" value={blockKey} />
													<input type="hidden" name="exerciseIdx" value={j} />
													<input type="hidden" name="direction" value={dir} />
													<button
														type="submit"
														disabled={Boolean(disabled)}
														aria-label={dir === 'up'
															? `Mover ${ex.name} uma posição para cima`
															: `Mover ${ex.name} uma posição para baixo`}
														title={dir === 'up' ? 'Mover para cima' : 'Mover para baixo'}
														style="all:unset;display:block;line-height:1;cursor:{disabled
															? 'default'
															: 'pointer'};font:500 8px var(--font-mono);color:{disabled
															? 'var(--ink-line-2)'
															: 'var(--ink-3)'};padding:2px 3px;border-radius:3px"
													>{glyph}</button>
												</form>
											{/each}
										</div>
									{/if}
									<div class="num" style="font:500 13px var(--font-mono);color:var(--ink-3)">
										{String(j + 1).padStart(2, '0')}
									</div>
								</div>
								<div>
									<div style="font:500 14px var(--font-sans);color:var(--ink-0)">
										{ex.name}
										{#if blockKey !== 'main'}
											<span
												style="font:var(--label-mono);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.06em;padding:2px 7px;border:1px solid var(--ink-line);border-radius:var(--r-pill);margin-left:6px;vertical-align:middle"
												>{blockLabel}</span
											>
										{/if}
									</div>
									{#if ex.muscle_groups && ex.muscle_groups.length > 0}
										<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
											{ex.muscle_groups.join(' · ')}
										</div>
									{/if}
								</div>
								<span class="num" style="font:500 13px var(--font-mono);color:var(--ink-1)">{ex.sets ?? '—'}×{ex.reps ?? '—'}</span>
								<span class="num" style="font:500 12px var(--font-mono);color:var(--ink-2)">↺ {ex.rest_seconds ?? '—'}s</span>
								{#if ex.load_guidance || ex.intensity}
									<span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
										{#if ex.load_guidance}
											<span
												style="font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 8px;border-radius:var(--r-pill);color:var(--accent);background:var(--accent-wash)"
												>{ex.load_guidance}</span
											>
										{/if}
										{#if ex.intensity}
											<span
												style="font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 8px;border-radius:var(--r-pill);color:var(--ink-1);border:1px solid var(--ink-line)"
												>{ex.intensity}</span
											>
										{/if}
									</span>
								{:else}
									<span></span>
								{/if}
								{#if catEntry?.videoUrl}
									<button
										type="button"
										onclick={() => toggleVideo(videoKey)}
										style="all:unset;cursor:pointer;font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border:1px solid var(--ink-line);border-radius:var(--r-pill);color:{videoOpen ? 'var(--accent)' : 'var(--ink-1)'};background:{videoOpen ? 'var(--accent-wash)' : 'transparent'}"
										aria-expanded={videoOpen}
									>{videoOpen ? '× fechar' : '▶ vídeo'}</button>
								{:else}
									<span></span>
								{/if}
								{#if !isArchived}
									{@const swapOpen = isPickerOpen(i, blockKey, j, 'swap')}
									<button
										type="button"
										onclick={() => openPicker(i, blockKey, j, 'swap', ex)}
										title="Trocar por outro exercício do catálogo"
										style="all:unset;cursor:pointer;font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border:1px solid var(--ink-line);border-radius:var(--r-pill);color:{swapOpen ? 'var(--accent)' : 'var(--ink-1)'};background:{swapOpen ? 'var(--accent-wash)' : 'transparent'}"
										aria-expanded={swapOpen}
									>{swapOpen ? '× fechar' : '⇄ trocar'}</button>
								{:else}
									<span></span>
								{/if}
								{#if !isArchived}
									<button
										type="button"
										onclick={() => toggleEdit(videoKey)}
										title="Editar exercício"
										style="all:unset;cursor:pointer;font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border:1px solid var(--ink-line);border-radius:var(--r-pill);color:{editOpen ? 'var(--accent)' : 'var(--ink-1)'};background:{editOpen ? 'var(--accent-wash)' : 'transparent'}"
										aria-expanded={editOpen}
									>{editOpen ? '× fechar' : '✎ editar'}</button>
								{:else}
									<span></span>
								{/if}
								{#if !isArchived}
									<!-- Excluir exercício direto da linha (além do trocar/editar). -->
									<form
										method="POST"
										action="?/removeExercise"
										use:enhance={({ cancel }) => {
											if (!window.confirm(`Excluir "${ex.name}" desta sessão?`)) {
												cancel();
												return;
											}
											savingEdit = true;
											return exerciseMutationHandler(() => {});
										}}
										style="display:contents"
									>
										<input type="hidden" name="sessionIdx" value={i} />
										<input type="hidden" name="block" value={blockKey} />
										<input type="hidden" name="exerciseIdx" value={j} />
										<button
											type="submit"
											title="Excluir exercício"
											style="all:unset;cursor:pointer;font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 10px;border:1px solid var(--ink-line);border-radius:var(--r-pill);color:var(--danger)"
										>✕ excluir</button>
									</form>
								{:else}
									<span></span>
								{/if}
							</div>

							{#if isPickerOpen(i, blockKey, j, 'swap')}
								{@render exercisePicker(i, blockKey, j, 'swap')}
							{/if}

							{#if editOpen}
								<form
									method="POST"
									action="?/editExercise"
									use:enhance={() => {
										savingEdit = true;
										return async ({ result, update }) => {
											savingEdit = false;
											if (result.type === 'success') {
												// #C04 — revalidação automática pós-edição: avisa se surgiram violações.
												const v = (result.data as any)?.validation;
												const n = (v?.violations as number) ?? 0;
												if (v && n > 0)
													toast.warn(
														`Exercício atualizado · ${n} violaç${n === 1 ? 'ão' : 'ões'} clínica${n === 1 ? '' : 's'} detectada${n === 1 ? '' : 's'}.`
													);
												else if (v) toast.success('Exercício atualizado · 0 violações clínicas.');
												else toast.success('Exercício atualizado.');
												editKey = null;
												await invalidateAll();
											} else if (result.type === 'failure') {
												toast.error(String(result.data?.error ?? 'Não foi possível salvar.'));
											} else {
												await update();
											}
										};
									}}
									style="padding:4px 20px 18px 60px;display:flex;flex-direction:column;gap:10px;background:var(--bg-1)"
								>
									<input type="hidden" name="sessionIdx" value={i} />
									<input type="hidden" name="block" value={blockKey} />
									<input type="hidden" name="exerciseIdx" value={j} />
									<div>
										<span class="edit-lbl">Nome do exercício</span>
										<input class="edit-in" name="name" value={ex.name} required minlength="2" />
									</div>
									<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
										<div>
											<span class="edit-lbl">Séries</span>
											<input class="edit-in" name="sets" type="number" min="1" max="20" value={ex.sets ?? ''} />
										</div>
										<div>
											<span class="edit-lbl">Repetições</span>
											<input class="edit-in" name="reps" value={ex.reps ?? ''} placeholder="ex: 8-12" />
										</div>
										<div>
											<span class="edit-lbl">Descanso (s)</span>
											<input class="edit-in" name="rest_seconds" type="number" min="0" max="900" value={ex.rest_seconds ?? ''} />
										</div>
										<div>
											<span class="edit-lbl">Intensidade (% força)</span>
											<input class="edit-in" name="intensity" value={ex.intensity ?? ''} placeholder="ex: 80% 1RM" />
										</div>
									</div>
									<div>
										<span class="edit-lbl">Carga (orientação)</span>
										<input class="edit-in" name="load_guidance" value={ex.load_guidance ?? ''} placeholder="ex: carga moderada / 20kg" />
									</div>
									<!-- Campos da ficha impressa (a IA raramente preenche — controle aqui) -->
									<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
										<div>
											<span class="edit-lbl">Cadência</span>
											<input class="edit-in" name="cadence" value={ex.cadence ?? ''} placeholder="ex: 2/2" />
										</div>
										<div>
											<span class="edit-lbl">Amplitude</span>
											<input class="edit-in" name="range_of_motion" value={ex.range_of_motion ?? ''} placeholder="ex: 90° / Total" />
										</div>
										<div>
											<span class="edit-lbl">Ação muscular</span>
											<select class="edit-in" name="muscle_action" value={ex.muscle_action ?? ''}>
												<option value="">—</option>
												<option value="isotonica">Isotônica</option>
												<option value="isometrica">Isométrica</option>
												<option value="auxotonico">Auxotônico</option>
												<option value="isocinetica">Isocinética</option>
											</select>
										</div>
									</div>
									<div>
										<span class="edit-lbl">Observações de execução</span>
										<textarea class="edit-in" name="execution_notes" rows="2">{ex.execution_notes ?? ''}</textarea>
									</div>
									<div style="display:flex;gap:8px;justify-content:flex-end">
										<Button type="button" variant="ghost" size="sm" onclick={() => (editKey = null)}>Cancelar</Button>
										<Button type="submit" size="sm" disabled={savingEdit}>{savingEdit ? 'Salvando…' : 'Salvar'}</Button>
									</div>
								</form>
							{/if}
							{#if catEntry?.videoUrl && videoOpen}
								<div style="padding:0 20px 16px 60px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
									<img
										src={catEntry.videoUrl}
										alt={ex.name}
										loading="lazy"
										style="width:280px;max-width:100%;border-radius:var(--r-md);background:var(--bg-0);border:1px solid var(--ink-line)"
									/>
									{#if catEntry.instructions && catEntry.instructions.length > 0}
										<ol style="flex:1;min-width:260px;margin:0;padding-left:20px;font:400 12px var(--font-sans);color:var(--ink-2);line-height:1.55">
											{#each catEntry.instructions as step (step)}
												<li style="margin-bottom:3px">{step}</li>
											{/each}
										</ol>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
						{#if !isArchived}
							{@const addOpen = isPickerOpen(i, blockKey, -1, 'add')}
							<div style="padding:8px 20px 12px 60px;border-top:1px solid var(--ink-line)">
								<button type="button" class="add-btn" onclick={() => openPicker(i, blockKey, -1, 'add')}>
									{addOpen ? '× fechar' : `＋ adicionar em ${blockLabel.toLowerCase()}`}
								</button>
							</div>
							{#if addOpen}
								{@render exercisePicker(i, blockKey, -1, 'add')}
							{/if}
						{/if}
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>
{/if}
