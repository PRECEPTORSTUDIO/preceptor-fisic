<script lang="ts">
	import { Chip, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
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

	let activeIdx = $state(0);
	let completed = $state<Record<number, boolean>>({});
	let loadByEx = $state<Record<number, string>>({});
	let rpe = $state(7);
	let observations = $state('');
	let submitting = $state(false);

	const ex = $derived(exercises[activeIdx]);
	const exVideo = $derived(ex ? (videoMap[ex.name]?.videoUrl ?? null) : null);
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
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<!-- Inputs ocultos do exercício atual capturados em hidden fields -->
		{#each exercises as exItem, i (i)}
			<input type="hidden" name="sets_{i}" value={exItem.sets ?? 0} />
			<input type="hidden" name="reps_{i}" value={exItem.reps ?? ''} />
			<input type="hidden" name="load_{i}" value={loadByEx[i] ?? ''} />
			<input type="hidden" name="completed_{i}" value={completed[i] ? 'on' : ''} />
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

				{#if ex.muscle_groups?.length}
					<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
						{#each ex.muscle_groups as g (g)}
							<Chip>{g}</Chip>
						{/each}
					</div>
				{/if}

				<!-- Vídeo tutorial — do catálogo, match por nome -->
				{#if exVideo}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						class="ex-video"
						src={exVideo}
						autoplay
						loop
						muted
						playsinline
						preload="metadata"
					></video>
				{:else}
					<div class="video">
						<div class="play-btn">▶</div>
						<div class="eyebrow" style="margin-top:8px">Sem vídeo pra este exercício</div>
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

				<!-- Quick load entry -->
				<div class="load-input-wrap">
					<label class="lbl">Carga usada hoje</label>
					<input
						bind:value={loadByEx[activeIdx]}
						placeholder={ex.load_guidance ?? 'ex: 20kg ou peso corporal'}
						class="load-input"
					/>
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
				<div style="font:500 18px var(--font-sans);margin-bottom:14px">Como foi o treino?</div>

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
	.load-input-wrap {
		margin: 14px 0;
	}
	.load-input {
		width: 100%;
		box-sizing: border-box;
		height: 48px;
		padding: 0 14px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 500 16px var(--font-mono);
		outline: none;
	}
	.load-input:focus {
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
