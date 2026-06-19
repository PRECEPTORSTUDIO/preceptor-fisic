<script lang="ts">
	import { Chip, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { classifyExercise, loadInputHint } from '$lib/exercise-load';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const session = $derived(data.session);
	const idx = $derived(data.sessionIdx);
	const studentId = $derived(data.student.id);
	const exercises = $derived(session.main ?? []);
	const videoMap = $derived(
		(data.videoMap ?? {}) as Record<string, { videoUrl: string | null; instructions: string[] }>
	);
	const tokenParam = $derived(page.url.searchParams.get('t'));
	const tq = $derived(tokenParam ? `?t=${tokenParam}` : '');

	// Cronômetro da sessão — marca início no mount, calcula minutos decorridos
	// no submit pra alimentar a carga interna (session-RPE = PSE × duração).
	let startedAt = $state(Date.now());
	let elapsedMin = $state(0);
	onMount(() => {
		startedAt = Date.now();
		const tick = setInterval(() => {
			elapsedMin = Math.round((Date.now() - startedAt) / 60000);
		}, 10000);
		return () => clearInterval(tick);
	});

	let activeIdx = $state(0);
	let completed = $state<Record<number, boolean>>({});
	let rpe = $state(7);
	let observations = $state('');
	let submitting = $state(false);
	// #1 — % da carga máxima usada hoje, por exercício (opcional).
	let intensityUsed = $state<Record<number, string>>({});

	// Reps prescritas → número-base pra pré-preencher cada série.
	// "8-12" vira "12" (alvo superior); "10" vira "10".
	function defaultReps(reps: string | undefined): string {
		if (!reps) return '';
		const m = String(reps).match(/(\d+)\s*(?:-|–|a|to|até)\s*(\d+)/);
		if (m) return m[2]!;
		const s = String(reps).match(/(\d+)/);
		return s ? s[1]! : '';
	}

	// Log por série: setLogs[exerciseIdx] = [{ weight, reps }, ...].
	// Inicializa N linhas (= séries prescritas) com reps pré-preenchidas, peso vazio.
	type SetRow = { weight: string; reps: string };
	let setLogs = $state<Record<number, SetRow[]>>(
		Object.fromEntries(
			((data.session?.main ?? []) as Array<{ sets?: number; reps?: string }>).map((e, i) => {
				const n = Math.max(1, Number(e.sets) || 1);
				const r = defaultReps(e.reps);
				return [i, Array.from({ length: n }, () => ({ weight: '', reps: r }))];
			})
		)
	);

	// Copia o peso da 1ª série pra todas (atalho comum — mesmo peso em todas).
	function repeatWeight(exIdx: number) {
		const rows = setLogs[exIdx];
		if (!rows || rows.length === 0) return;
		const w = rows[0]!.weight;
		setLogs[exIdx] = rows.map((row) => ({ ...row, weight: w }));
	}

	const ex = $derived(exercises[activeIdx]);
	const exVideo = $derived(ex ? (videoMap[ex.name]?.videoUrl ?? null) : null);

	// Classificação do exercício pra escolher o input de carga (kg / nada / segundos).
	// Mantemos os mesmos campos `weight` + `reps` no setLog: pra `time` o "weight"
	// vira "segundos" (mesmo input, label diferente); pra `bodyweight` esconde
	// o input de carga e mantém só reps (tonelagem é estimada server-side).
	const exKind = $derived(
		ex
			? classifyExercise({
					name: ex.name,
					equipment: (ex as { equipment?: string }).equipment ?? null,
					muscle_groups: ex.muscle_groups,
					body_part: (ex as { body_part?: string }).body_part ?? null
				})
			: 'weight'
	);
	const exHint = $derived(loadInputHint(exKind));
	const completedCount = $derived(Object.values(completed).filter(Boolean).length);
	const allCompleted = $derived(completedCount === exercises.length);

	function toggleCompleted(i: number) {
		completed[i] = !completed[i];
	}

	function next() {
		if (activeIdx < exercises.length - 1) activeIdx++;
	}
	function prev() {
		if (activeIdx > 0) activeIdx--;
	}

	function intensityColor(load: string | undefined) {
		if (!load) return 'var(--ink-2)';
		const m = load.match(/RPE\s*(\d+)/i);
		if (!m) return 'var(--info)';
		const v = Number(m[1]);
		return v >= 8 ? 'var(--danger)' : v >= 6 ? 'var(--warn)' : 'var(--success)';
	}
</script>

<svelte:head>
	<title>{session.label} · Preceptor Fisic</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="page">
	<!-- Top bar -->
	<header class="topbar">
		<button onclick={() => goto(`/a/${studentId}${tq}`)} class="back-btn">←</button>
		<div style="flex:1;text-align:center;min-width:0">
			<div class="eyebrow">Sessão {idx + 1}{session.duration_minutes ? ' · ' + session.duration_minutes + 'min' : ''}</div>
			<div style="font:500 16px var(--font-sans);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
				{session.label}
			</div>
		</div>
		<div style="width:40px"></div>
	</header>

	<!-- Progress strip -->
	<div class="progress-strip">
		{#each exercises as _, i (i)}
			<button
				type="button"
				class="prog-dot"
				class:active={i === activeIdx}
				class:done={completed[i]}
				onclick={() => (activeIdx = i)}
			>
				{completed[i] ? '✓' : i + 1}
			</button>
		{/each}
	</div>

	<form
		method="POST"
		action="?/complete"
		use:enhance={({ formData }) => {
			submitting = true;
			// Recalcula a duração exata no instante do submit
			formData.set('duration_minutes', String(Math.round((Date.now() - startedAt) / 60000)));
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<!-- Inputs ocultos: token (form POST tira da URL → 403 no redirect),
		     duração + por exercício (séries com peso/reps em JSON) -->
		<input type="hidden" name="_t" value={tokenParam ?? ''} />
		<input type="hidden" name="duration_minutes" value={elapsedMin} />
		{#each exercises as exItem, i (i)}
			<input type="hidden" name="sets_{i}" value={exItem.sets ?? 0} />
			<input type="hidden" name="reps_{i}" value={exItem.reps ?? ''} />
			<input type="hidden" name="setlogs_{i}" value={JSON.stringify(setLogs[i] ?? [])} />
			<input type="hidden" name="completed_{i}" value={completed[i] ? 'on' : ''} />
			<input type="hidden" name="pct_{i}" value={intensityUsed[i] ?? ''} />
		{/each}

		<!-- Detalhe do exercício ativo -->
		{#if ex}
			<div class="ex-card">
				<div class="ex-num">{String(activeIdx + 1).padStart(2, '0')}</div>
				<div class="eyebrow" style="margin-top:14px">Exercício {activeIdx + 1} de {exercises.length}</div>
				<h2 style="font:500 24px var(--font-sans);margin:6px 0 10px;letter-spacing:-0.01em">{ex.name}</h2>

				<div class="ex-meta">
					<span><span style="color:var(--ink-1)">{ex.sets ?? '—'}</span> séries</span>
					<span class="dot">·</span>
					<span><span style="color:var(--ink-1)">{ex.reps ?? '—'}</span> reps</span>
					<span class="dot">·</span>
					<span>↺ <span style="color:var(--ink-1)">{ex.rest_seconds ?? '—'}s</span></span>
					{#if ex.load_guidance}
						<span class="dot">·</span>
						<span style="color:{intensityColor(ex.load_guidance)}">{ex.load_guidance}</span>
					{/if}
				</div>

				{#if ex.intensity}
					<div class="intensity-rx">
						<span class="intensity-rx-lbl">Intensidade prescrita</span>
						<span class="intensity-rx-val">{ex.intensity}</span>
					</div>
				{/if}

				{#if ex.muscle_groups?.length}
					<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
						{#each ex.muscle_groups as g (g)}
							<Chip>{g}</Chip>
						{/each}
					</div>
				{/if}

				<!-- Animação demonstrativa (GIF) do catálogo, match por catalog_id ou nome -->
				{#if exVideo}
					<img class="ex-video" src={exVideo} alt={ex?.name ?? 'Exercício'} loading="lazy" />
				{:else}
					<div class="video">
						<div class="play-btn">▶</div>
						<div class="eyebrow" style="margin-top:8px">Sem animação pra este exercício</div>
					</div>
				{/if}

				{#if ex.execution_notes}
					<div class="card" style="padding:14px;margin-bottom:12px">
						<div class="eyebrow" style="margin-bottom:6px">Forma de execução</div>
						<div style="font:var(--body-sm);color:var(--ink-1);line-height:1.5">{ex.execution_notes}</div>
					</div>
				{/if}

				{#if ex.contraindications?.length}
					<div
						style="padding:12px 14px;background:var(--warn-dim);border:1px solid var(--warn);border-left:3px solid var(--warn);border-radius:var(--r-2);margin-bottom:14px"
					>
						<div class="eyebrow" style="color:var(--warn);margin-bottom:4px">⚠ Atenção</div>
						<div style="font:var(--body-sm);color:var(--ink-0)">
							{ex.contraindications.join(' · ')}
						</div>
					</div>
				{/if}

				<!-- Registro por série: campo de carga muda por tipo de exercício.
				     - weight     → kg × reps  (tonelagem = kg × reps × sets)
				     - bodyweight → só reps    (tonelagem estimada via peso do aluno)
				     - time       → s × séries (carga interna = duração × RPE)
				     Helper em $lib/exercise-load.ts. -->
				<div class="sets-log">
					<div class="sets-log-head">
						<span class="lbl">Como foi cada série · {exHint.help}</span>
						{#if exKind === 'weight' && (setLogs[activeIdx]?.length ?? 0) > 1}
							<button type="button" class="repeat-btn" onclick={() => repeatWeight(activeIdx)}>
								= repetir peso da 1ª
							</button>
						{/if}
					</div>
					<div class="sets-rows">
						{#each setLogs[activeIdx] ?? [] as row, si (si)}
							<div class="set-row">
								<span class="set-num">{si + 1}ª</span>
								{#if exKind !== 'bodyweight'}
									<div class="set-field">
										<input
											type="text"
											inputmode={exKind === 'time' ? 'numeric' : 'decimal'}
											bind:value={row.weight}
											placeholder={exHint.placeholder}
											class="set-input"
										/>
										<span class="set-unit">{exHint.unit}</span>
									</div>
									<span class="set-x">×</span>
								{:else}
									<span class="set-x" style="color:var(--ink-3);font-size:11px">peso corporal ·</span>
								{/if}
								<div class="set-field">
									<input
										type="text"
										inputmode="numeric"
										bind:value={row.reps}
										placeholder="reps"
										class="set-input"
									/>
									<span class="set-unit">reps</span>
								</div>
							</div>
						{/each}
					</div>
					<div class="sets-hint">Peso corporal? Deixe o peso vazio — conta só as repetições.</div>

					<div class="pct-used">
						<span class="lbl">% da carga máxima usada hoje (opcional)</span>
						<div class="pct-field">
							<input
								type="text"
								inputmode="numeric"
								bind:value={intensityUsed[activeIdx]}
								placeholder={ex.intensity ? `prescrito: ${ex.intensity}` : 'ex: 80'}
								class="set-input"
								style="text-align:left"
							/>
							<span class="set-unit">%</span>
						</div>
					</div>
				</div>

				<!-- Botão concluir exercício -->
				<button
					type="button"
					class="done-btn"
					class:done={completed[activeIdx]}
					onclick={() => toggleCompleted(activeIdx)}
				>
					{completed[activeIdx] ? '✓ Concluído' : 'Marcar como concluído'}
				</button>

				<!-- Nav anterior/próximo -->
				<div class="nav-row">
					<button type="button" class="nav-btn" disabled={activeIdx === 0} onclick={prev}>← Anterior</button>
					{#if activeIdx < exercises.length - 1}
						<button type="button" class="nav-btn primary" onclick={next}>Próximo →</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Final: RPE + observations -->
		{#if allCompleted || activeIdx === exercises.length - 1}
			<div class="finish-card">
				<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
					<div style="font:500 18px var(--font-sans)">Como foi o treino?</div>
					<span class="num" style="font:500 13px var(--font-mono);color:var(--ink-2)">⏱ {elapsedMin} min</span>
				</div>

				<label class="lbl">PSE — Esforço percebido (0-10)</label>
				<div class="rpe-row">
					{#each [4, 5, 6, 7, 8, 9, 10] as v (v)}
						<button
							type="button"
							class="rpe-btn"
							class:on={rpe === v}
							onclick={() => (rpe = v)}
						>{v}</button>
					{/each}
					<input type="hidden" name="rpe" value={rpe} />
				</div>

				<label class="lbl" style="margin-top:14px">Observações (opcional)</label>
				<textarea
					name="observations"
					bind:value={observations}
					placeholder="Algo que o treinador deve saber sobre o treino…"
					class="obs-input"
					rows="3"
				></textarea>

				<button
					type="submit"
					class="finish-btn"
					disabled={submitting || completedCount === 0}
				>
					{submitting ? 'Salvando…' : `✓ Finalizar treino · ${completedCount}/${exercises.length}`}
				</button>

				{#if form?.error}
					<div style="color:var(--danger);font:var(--body-sm);text-align:center;margin-top:8px">{form.error}</div>
				{/if}
			</div>
		{/if}
	</form>
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-bottom: 24px;
	}
	/* Workout execution stays focused — 560px max no desktop */
	@media (min-width: 1024px) {
		.page {
			max-width: 640px;
			width: 100%;
			margin: 0 auto;
		}
		.topbar {
			background: transparent;
			border-bottom: 1px solid var(--ink-line);
		}
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
	.progress-strip {
		display: flex;
		gap: 6px;
		padding: 14px 16px;
		overflow-x: auto;
		border-bottom: 1px solid var(--ink-line);
	}
	.prog-dot {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		color: var(--ink-3);
		font: 500 13px var(--font-mono);
		cursor: pointer;
	}
	.prog-dot.active {
		background: var(--accent);
		color: #0a0a0a;
		border-color: var(--accent);
		box-shadow: var(--glow-accent);
	}
	.prog-dot.done {
		background: var(--success-dim);
		color: var(--success);
		border-color: var(--success);
	}
	.prog-dot.done.active {
		background: var(--success);
		color: #0a0a0a;
	}
	.ex-card {
		padding: 20px 16px 12px;
	}
	.ex-num {
		display: inline-block;
		width: 56px;
		height: 56px;
		border-radius: var(--r-2);
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		color: var(--accent);
		font: 300 24px var(--font-sans);
		text-align: center;
		line-height: 56px;
	}
	.ex-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font: var(--body);
		color: var(--ink-2);
		margin-bottom: 12px;
	}
	.ex-meta .dot {
		color: var(--ink-3);
	}
	.ex-video {
		width: 100%;
		aspect-ratio: 1;
		max-height: 320px;
		object-fit: cover;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-3);
		margin-bottom: 14px;
		display: block;
	}
	.video {
		height: 180px;
		background: linear-gradient(135deg, var(--bg-2) 0%, var(--bg-1) 100%);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-3);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
		margin-bottom: 14px;
		overflow: hidden;
	}
	.play-btn {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		color: #0a0a0a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22px;
		box-shadow: var(--glow-accent);
	}
	.lbl {
		display: block;
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	/* Registro por série */
	.sets-log {
		margin: 16px 0;
	}
	.sets-log-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.repeat-btn {
		all: unset;
		cursor: pointer;
		font: var(--label-mono);
		color: var(--accent);
		padding: 4px 8px;
		border-radius: var(--r-1);
		border: 1px solid var(--accent-dim);
	}
	.repeat-btn:active {
		background: var(--accent-wash);
	}
	.sets-rows {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.set-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.set-num {
		flex-shrink: 0;
		width: 26px;
		font: 500 14px var(--font-mono);
		color: var(--ink-2);
		text-align: center;
	}
	.set-field {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		padding: 0 12px;
		height: 48px;
		transition: border-color 140ms var(--ease);
	}
	.set-field:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.set-input {
		width: 100%;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--ink-0);
		font: 500 17px var(--font-mono);
		text-align: right;
	}
	.set-unit {
		flex-shrink: 0;
		font: var(--label-mono);
		color: var(--ink-3);
	}
	.set-x {
		flex-shrink: 0;
		color: var(--ink-3);
		font: 500 14px var(--font-mono);
	}
	.sets-hint {
		margin-top: 8px;
		font: var(--label-mono);
		color: var(--ink-3);
	}
	.intensity-rx {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		margin-bottom: 14px;
		background: var(--accent-wash);
		border: 1px solid var(--accent-dim);
		border-radius: var(--r-2);
	}
	.intensity-rx-lbl {
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
	}
	.intensity-rx-val {
		font: 600 16px var(--font-mono);
		color: var(--accent);
	}
	.pct-used {
		margin-top: 14px;
	}
	.pct-field {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		padding: 0 12px;
		height: 48px;
		max-width: 200px;
		transition: border-color 140ms var(--ease);
	}
	.pct-field:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.done-btn {
		width: 100%;
		height: 52px;
		background: var(--bg-3);
		color: var(--ink-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 500 15px var(--font-sans);
		cursor: pointer;
		transition: all 140ms var(--ease);
	}
	.done-btn.done {
		background: var(--success-dim);
		color: var(--success);
		border-color: var(--success);
	}
	.nav-row {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}
	.nav-btn {
		flex: 1;
		height: 44px;
		background: var(--bg-3);
		color: var(--ink-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 500 14px var(--font-sans);
		cursor: pointer;
	}
	.nav-btn.primary {
		background: var(--accent);
		color: #0a0a0a;
		border-color: var(--accent);
	}
	.nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.finish-card {
		margin: 12px 16px;
		padding: 18px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
	}
	.rpe-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.rpe-btn {
		height: 44px;
		background: var(--bg-3);
		color: var(--ink-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 500 15px var(--font-mono);
		cursor: pointer;
	}
	.rpe-btn.on {
		background: var(--accent);
		color: #0a0a0a;
		border-color: var(--accent);
		box-shadow: var(--glow-accent);
	}
	.obs-input {
		width: 100%;
		box-sizing: border-box;
		min-height: 80px;
		padding: 12px 14px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 400 14px/1.5 var(--font-sans);
		outline: none;
		resize: vertical;
	}
	.finish-btn {
		width: 100%;
		height: 52px;
		margin-top: 16px;
		background: var(--accent);
		color: #0a0a0a;
		border: 0;
		border-radius: var(--r-2);
		font: 500 16px var(--font-sans);
		cursor: pointer;
		box-shadow: 0 8px 24px rgba(167, 139, 250, 0.3);
	}
	.finish-btn:disabled {
		background: var(--bg-3);
		color: var(--ink-3);
		box-shadow: none;
		cursor: not-allowed;
	}
</style>
