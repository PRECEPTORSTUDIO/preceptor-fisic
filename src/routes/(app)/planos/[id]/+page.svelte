<script lang="ts">
	import { Button, Chip, Eyebrow, toast } from '$lib/components/ui';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const plan = $derived(data.plan);
	const planData = $derived(plan.planData);
	const sessions = $derived(planData.weekly_sessions ?? []);
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

	const redCount = $derived(restrictions.filter((r) => r.level === 'red').length);
	const canPublish = $derived(isGenerated && redCount === 0);

	let publishing = $state(false);

	type PartialPlan = {
		summary?: string;
		weekly_sessions?: Array<{
			label?: string;
			focus?: string;
			duration_minutes?: number;
			main?: Array<{ name?: string; reps?: string; sets?: number; load_guidance?: string }>;
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
	let liveStreamText = $state<string>('');
	let streamScrollEl: HTMLPreElement | undefined = $state();
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	// Auto-scroll do bloco "Gemini escrevendo" pro fim quando texto cresce
	$effect(() => {
		if (liveStreamText && streamScrollEl) {
			streamScrollEl.scrollTop = streamScrollEl.scrollHeight;
		}
	});

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
				if (s.streamText) liveStreamText = s.streamText;
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

			<!-- Gemini escrevendo — texto bruto chegando token por token,
				 estilo terminal/log. Cursor piscando no fim. -->
			{#if liveStreamText}
				<div class="gen-stream-block">
					<div class="gen-stream-header">
						<span class="gen-stream-dot"></span>
						<span>PreceptorFISIC · gerando</span>
						<span class="gen-stream-meta">{liveStreamText.length.toLocaleString('pt-BR')} chars</span>
					</div>
					<pre class="gen-stream-text" bind:this={streamScrollEl}>{liveStreamText}<span class="gen-stream-cursor">▋</span></pre>
				</div>
			{/if}

			<!-- Plano materializando ao vivo (estruturado) -->
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
											{#if s.main && s.main.length > 0}
												<div style="display:flex;flex-direction:column;gap:4px">
													{#each s.main as ex, ei (ei)}
														{#if ex.name}
															<div class="gen-ex">
																<span style="color:var(--accent)">·</span>
																<span style="flex:1;font:400 13px var(--font-sans);color:var(--ink-1)"
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
											{/if}
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
				Pode levar 15-30s · Plano completa automaticamente
			</div>
		</div>
	</div>

	<style>
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

		/* "Gemini escrevendo" — bloco terminal/log com texto chegando ao vivo */
		.gen-stream-block {
			margin-top: 24px;
			background: #0a0a0d;
			border: 1px solid var(--ink-line);
			border-radius: var(--r-2);
			overflow: hidden;
			animation: gen-fade 240ms var(--ease) backwards;
		}
		.gen-stream-header {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 14px;
			background: rgba(167, 139, 250, 0.06);
			border-bottom: 1px solid var(--ink-line);
			font: 500 11px var(--font-mono);
			color: var(--ink-2);
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}
		.gen-stream-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--accent);
			box-shadow: 0 0 8px var(--accent);
			animation: gen-pulse 1.4s ease-in-out infinite;
		}
		.gen-stream-meta {
			margin-left: auto;
			color: var(--ink-3);
			font-variant-numeric: tabular-nums;
		}
		.gen-stream-text {
			margin: 0;
			padding: 14px 18px;
			max-height: 260px;
			overflow-y: auto;
			overflow-x: hidden;
			font: 400 12.5px/1.55 var(--font-mono);
			color: var(--ink-1);
			white-space: pre-wrap;
			word-break: break-word;
			background: transparent;
		}
		.gen-stream-text::-webkit-scrollbar {
			width: 6px;
		}
		.gen-stream-text::-webkit-scrollbar-thumb {
			background: var(--ink-line-2);
			border-radius: 3px;
		}
		.gen-stream-cursor {
			display: inline-block;
			color: var(--accent);
			animation: gen-cursor-blink 1s steps(2, start) infinite;
			margin-left: 1px;
		}
		@keyframes gen-cursor-blink {
			to {
				opacity: 0;
			}
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
			<Button onclick={() => goto(`/alunos/${plan.studentId}/gerar`)}>↻ Tentar de novo</Button>
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
						>⚠ {redCount} restrição{redCount > 1 ? 'ões' : ''} crítica{redCount > 1 ? 's' : ''}</span>
					{/if}
					<Button type="submit" disabled={!canPublish || publishing}>
						{publishing ? 'Publicando…' : '✓ Publicar pro aluno'}
					</Button>
				</form>
			{:else if isPublished}
				<Chip variant="success">● Publicado</Chip>
				<form
					method="POST"
					action="?/archive"
					use:enhance={() => async ({ update, result }) => {
						await update();
						if (result.type === 'success') toast.info('Plano arquivado.');
						await invalidateAll();
					}}
				>
					<Button variant="secondary" type="submit">Arquivar</Button>
				</form>
			{:else if isArchived}
				<Chip>○ Arquivado</Chip>
			{/if}
			{#if !isGenerating && !hasFailed}
				<form
					method="POST"
					action="?/revalidate"
					use:enhance={() => async ({ update, result }) => {
						await update();
						if (result.type === 'success') {
							const v = (result.data as any)?.[0]?.validation;
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
					<div style="font:500 14px var(--font-sans);color:var(--ink-0);margin-top:6px;text-transform:capitalize">{plan.status}</div>
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
					<div
						class="card"
						style="padding:18px;background:{levelBg(r.level)};border:1px solid {levelColor(r.level)};border-left:4px solid {levelColor(r.level)}"
					>
						<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
							<span
								style="font:var(--label-mono);color:{levelColor(r.level)};text-transform:uppercase;letter-spacing:0.08em;padding:2px 8px;background:rgba(0,0,0,0.25);border-radius:var(--r-pill)"
								>{levelLabel(r.level)}</span
							>
							{#if citationLabel(r.source as SrcRef)}
								<span style="font:var(--label-mono);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px"
									>{citationBadge(r.source as SrcRef)} {citationLabel(r.source as SrcRef)}</span
								>
							{/if}
						</div>
						<div style="font:600 14px var(--font-sans);color:var(--ink-0);margin-bottom:6px">{r.title}</div>
						<div style="font:var(--body-sm);color:var(--ink-0);line-height:1.5;opacity:0.92">{r.description}</div>
						{#if r.affected_exercises.length > 0}
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
									>"{src.excerpt}{src.excerpt.length >= 280 ? '…' : ''}"</blockquote
								>
							</details>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Sessões de treino -->
		<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin:8px 0 14px">Sessões de treino</div>
		{#if sessions.length === 0}
			<div class="card" style="padding:32px;text-align:center;color:var(--ink-2)">
				Plano sem sessões definidas.
			</div>
		{:else}
			{#each sessions as s, i (i)}
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
							>{s.main?.length ?? 0} exercícios{s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}{s.focus ? ` · ${s.focus}` : ''}</div>
						</div>
						<span style="color:var(--accent);font:500 13px var(--font-sans)">▶ Iniciar</span>
					</button>

					{#each (s.main ?? []) as ex, j (ex.name + j)}
						{@const catEntry = ex.catalog_id ? catalogMap[ex.catalog_id] : null}
						{@const videoKey = `${i}-main-${j}`}
						{@const videoOpen = openVideoKey === videoKey}
						<div
							style="display:flex;flex-direction:column;{j ? 'border-top:1px solid var(--ink-line)' : ''}"
						>
							<div
								style="padding:14px 20px;display:grid;grid-template-columns:32px 1fr auto auto auto auto;gap:14px;align-items:center"
							>
								<div class="num" style="font:500 13px var(--font-mono);color:var(--ink-3)">
									{String(j + 1).padStart(2, '0')}
								</div>
								<div>
									<div style="font:500 14px var(--font-sans);color:var(--ink-0)">{ex.name}</div>
									{#if ex.muscle_groups && ex.muscle_groups.length > 0}
										<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
											{ex.muscle_groups.join(' · ')}
										</div>
									{/if}
								</div>
								<span class="num" style="font:500 13px var(--font-mono);color:var(--ink-1)">{ex.sets ?? '—'}×{ex.reps ?? '—'}</span>
								<span class="num" style="font:500 12px var(--font-mono);color:var(--ink-2)">↺ {ex.rest_seconds ?? '—'}s</span>
								{#if ex.load_guidance}
									<span
										style="font:500 11px var(--font-mono);text-transform:uppercase;letter-spacing:0.06em;padding:3px 8px;border-radius:var(--r-pill);color:var(--accent);background:var(--accent-wash)"
										>{ex.load_guidance}</span
									>
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
							</div>
							{#if catEntry?.videoUrl && videoOpen}
								<div style="padding:0 20px 16px 60px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
									<video
										src={catEntry.videoUrl}
										controls
										autoplay
										loop
										muted
										playsinline
										preload="metadata"
										style="width:280px;max-width:100%;border-radius:var(--r-md);background:var(--bg-0);border:1px solid var(--ink-line)"
									><track kind="captions" /></video>
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
				</div>
			{/each}
		{/if}
	</div>
</div>
{/if}
