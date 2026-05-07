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

	const isGenerating = $derived(plan.status === 'pending' || plan.status === 'generating');
	const hasFailed = $derived(plan.status === 'failed');
	const isGenerated = $derived(plan.status === 'generated');
	const isPublished = $derived(plan.status === 'published');
	const isArchived = $derived(plan.status === 'archived');

	const redCount = $derived(restrictions.filter((r) => r.level === 'red').length);
	const canPublish = $derived(isGenerated && redCount === 0);

	let publishing = $state(false);

	type StatusResp = {
		id: string;
		status: string;
		progress: number;
		phase: string | null;
		error: string | null;
		generated: boolean;
		failed: boolean;
	};

	let livePhase = $state(plan.status === 'pending' ? 'enfileirado' : 'iniciando…');
	let liveProgress = $state(5);
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
				if (s.generated || s.failed) {
					if (pollInterval) clearInterval(pollInterval);
					await invalidateAll();
				}
			} catch {
				// ignora — tenta de novo
			}
		};
		tick();
		pollInterval = setInterval(tick, 1500);
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
	<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-0);min-height:80vh">
		<div style="display:flex;flex-direction:column;align-items:center;gap:24px;max-width:480px;text-align:center">
			<div style="position:relative;width:80px;height:80px">
				<div class="spinner-gen"></div>
			</div>
			<div>
				<div class="eyebrow" style="margin-bottom:6px">{plan.studentName}</div>
				<h1 style="font:500 22px var(--font-sans);margin:0 0 8px">Gerando plano com IA</h1>
				<div style="font:var(--body-sm);color:var(--accent);min-height:20px">{livePhase}</div>
			</div>
			<div style="width:100%;max-width:320px">
				<div style="height:6px;border-radius:3px;background:var(--bg-3);overflow:hidden">
					<div
						style="height:100%;background:var(--accent);box-shadow:0 0 12px var(--accent-glow);width:{liveProgress}%;transition:width 600ms var(--ease)"
					></div>
				</div>
				<div style="display:flex;justify-content:space-between;margin-top:8px;font:var(--label-mono);color:var(--ink-3)">
					<span>{liveProgress}%</span>
					<span>Gemini 2.5 Flash · ACSM ★</span>
				</div>
			</div>
			<div style="font:var(--label-mono);color:var(--ink-3);margin-top:8px">
				Pode levar 15-30s. A página atualiza automaticamente.
			</div>
		</div>
	</div>

	<style>
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
	</style>
{:else if hasFailed}
	<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-0);min-height:80vh">
		<div style="display:flex;flex-direction:column;align-items:center;gap:18px;max-width:480px;text-align:center">
			<div
				style="width:64px;height:64px;border-radius:50%;background:var(--danger-dim);display:flex;align-items:center;justify-content:center;color:var(--danger);font-size:28px"
			>✗</div>
			<div>
				<h1 style="font:500 22px var(--font-sans);margin:0 0 8px;color:var(--ink-0)">Geração falhou</h1>
				<div style="font:var(--body-sm);color:var(--ink-2)">A IA não conseguiu produzir um plano válido. Tente novamente.</div>
			</div>
			<Button onclick={() => goto(`/alunos/${plan.studentId}/gerar`)}>↻ Tentar de novo</Button>
		</div>
	</div>
{:else}

<div style="flex:1;overflow-y:auto;background:var(--bg-0)">
	<header
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
		<div style="display:flex;gap:8px;flex-shrink:0;align-items:center">
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

	<div style="padding:28px 32px 80px;max-width:1100px;margin:0 auto">
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
							{#if r.source?.type === 'rule' && r.source.rule_code}
								<span style="font:var(--label-mono);color:var(--ink-3)">▢ {r.source.rule_code}</span>
							{:else if r.source?.type === 'rag_chunk'}
								<span style="font:var(--label-mono);color:var(--ink-3)">▢ FONTE RAG</span>
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
						<div
							style="padding:14px 20px;display:grid;grid-template-columns:32px 1fr auto auto auto;gap:14px;align-items:center;{j ? 'border-top:1px solid var(--ink-line)' : ''}"
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
						</div>
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>
{/if}
