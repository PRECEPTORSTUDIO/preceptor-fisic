<script lang="ts">
	import { Eyebrow, Chip } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import type { PageData } from './$types';
	import type { CatalogExercise } from '$lib/server/queries';

	let { data }: { data: PageData } = $props();
	const items = $derived(data.items);
	const facets = $derived(data.facets);
	const filters = $derived(data.filters);
	const totalPages = $derived(Math.ceil(data.total / data.pageSize));

	let searchInput = $state(data.filters.query);
	let selected = $state<CatalogExercise | null>(null);

	// Tradução PT-BR dos rótulos de body part (vêm em EN do dataset)
	const BODY_PART_PT: Record<string, string> = {
		'upper arms': 'Braços',
		'upper legs': 'Coxas',
		back: 'Costas',
		waist: 'Core / Abdômen',
		chest: 'Peito',
		shoulders: 'Ombros',
		'lower legs': 'Panturrilhas',
		'lower arms': 'Antebraços',
		cardio: 'Cardio',
		neck: 'Pescoço'
	};
	const DIFFICULTY_PT: Record<string, string> = {
		beginner: 'Iniciante',
		intermediate: 'Intermediário',
		advanced: 'Avançado'
	};

	function applyFilters(patch: Record<string, string>) {
		const u = new URL(pageState.url);
		for (const [k, v] of Object.entries(patch)) {
			if (v) u.searchParams.set(k, v);
			else u.searchParams.delete(k);
		}
		u.searchParams.delete('page'); // reset paginação ao filtrar
		goto(u.toString(), { keepFocus: true });
	}

	function goToPage(p: number) {
		const u = new URL(pageState.url);
		u.searchParams.set('page', String(p));
		goto(u.toString());
	}

	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => applyFilters({ q: searchInput }), 350);
	}
</script>

<svelte:head>
	<title>Catálogo de exercícios · Preceptor Fisic</title>
</svelte:head>

<div class="cat-main">
	<div class="ex-tabs">
		<a href="/exercicios" class="ex-tab on" data-sveltekit-noscroll>
			Catálogo
			<span class="ex-tab-count">{facets.total}</span>
		</a>
		<a href="/exercicios/meus" class="ex-tab">Meus exercícios</a>
	</div>

	<header class="cat-header">
		<div>
			<Eyebrow>◆ Biblioteca licenciada · vídeo em todos</Eyebrow>
			<h1 class="cat-h1">Catálogo de exercícios</h1>
			<p class="cat-sub">
				Biblioteca licenciada com demonstração em vídeo. O PreceptorFISIC usa esse catálogo ao gerar planos —
				cada exercício prescrito vem com tutorial.
			</p>
		</div>
	</header>

	<!-- Busca -->
	<div class="cat-search">
		<span>⌕</span>
		<input
			bind:value={searchInput}
			oninput={onSearchInput}
			placeholder="Buscar exercício por nome…"
		/>
		{#if data.total > 0}
			<span class="cat-count">{data.total} resultado{data.total > 1 ? 's' : ''}</span>
		{/if}
	</div>

	<!-- Filtros -->
	<div class="cat-filters">
		<div class="cat-filter-row">
			<span class="cat-filter-label">Grupo</span>
			<Chip active={!filters.bodyPart} onclick={() => applyFilters({ bp: '' })}>Todos</Chip>
			{#each facets.bodyParts as bp (bp.value)}
				<Chip active={filters.bodyPart === bp.value} onclick={() => applyFilters({ bp: bp.value })}>
					{BODY_PART_PT[bp.value] ?? bp.value} · {bp.count}
				</Chip>
			{/each}
		</div>
		<div class="cat-filter-row">
			<span class="cat-filter-label">Nível</span>
			<Chip active={!filters.difficulty} onclick={() => applyFilters({ diff: '' })}>Todos</Chip>
			{#each ['beginner', 'intermediate', 'advanced'] as d (d)}
				<Chip active={filters.difficulty === d} onclick={() => applyFilters({ diff: d })}>
					{DIFFICULTY_PT[d]}
				</Chip>
			{/each}
		</div>
	</div>

	<!-- Grid -->
	{#if items.length === 0}
		<div class="cat-empty">
			<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:6px">
				Nenhum exercício encontrado
			</div>
			<div style="font:var(--body-sm);color:var(--ink-2)">Tente outro termo ou limpe os filtros.</div>
		</div>
	{:else}
		<div class="cat-grid">
			{#each items as ex (ex.id)}
				<button type="button" class="cat-card" onclick={() => (selected = ex)}>
					<div class="cat-card-video">
						{#if ex.videoUrl}
							<!-- Mostra POSTER (1º frame JPG ~30KB) em vez do GIF (~1.7MB).
							     Sem isso 1324 GIFs animariam todos ao mesmo tempo. Click
							     no card abre o modal que toca o GIF completo. -->
							<img
								src={ex.videoUrl.replace(/\.gif$/, '.jpg')}
								alt={ex.name}
								loading="lazy"
							/>
						{:else}
							<div class="cat-card-novideo">▶</div>
						{/if}
					</div>
					<div class="cat-card-body">
						<div class="cat-card-name">{ex.name}</div>
						<div class="cat-card-meta">
							{BODY_PART_PT[ex.bodyPart] ?? ex.bodyPart}{ex.equipment ? ` · ${ex.equipment}` : ''}
						</div>
					</div>
				</button>
			{/each}
		</div>

		<!-- Paginação -->
		{#if totalPages > 1}
			<div class="cat-pagination">
				<button
					type="button"
					class="cat-page-btn"
					disabled={data.page <= 1}
					onclick={() => goToPage(data.page - 1)}>← Anterior</button
				>
				<span class="cat-page-info">Página {data.page} de {totalPages}</span>
				<button
					type="button"
					class="cat-page-btn"
					disabled={data.page >= totalPages}
					onclick={() => goToPage(data.page + 1)}>Próxima →</button
				>
			</div>
		{/if}
	{/if}
</div>

<!-- Modal de detalhe -->
{#if selected}
	<div
		class="cat-modal-backdrop"
		onclick={() => (selected = null)}
		onkeydown={(e) => e.key === 'Escape' && (selected = null)}
		role="presentation"
	></div>
	<div class="cat-modal" role="dialog" aria-modal="true" aria-label={selected.name}>
		<button type="button" class="cat-modal-close" onclick={() => (selected = null)} aria-label="Fechar">✕</button>
		{#if selected.videoUrl}
			<img class="cat-modal-video" src={selected.videoUrl} alt={selected.name} />
		{/if}
		<div class="cat-modal-body">
			<Eyebrow>{BODY_PART_PT[selected.bodyPart] ?? selected.bodyPart}</Eyebrow>
			<h2 class="cat-modal-title">{selected.name}</h2>
			<div class="cat-modal-tags">
				<Chip>{selected.targetMuscle}</Chip>
				{#each selected.secondaryMuscles as m (m)}<Chip>{m}</Chip>{/each}
				{#if selected.equipment}<Chip>{selected.equipment}</Chip>{/if}
				{#if selected.difficulty}<Chip>{DIFFICULTY_PT[selected.difficulty] ?? selected.difficulty}</Chip>{/if}
			</div>
			{#if selected.description}
				<p class="cat-modal-desc">{selected.description}</p>
			{/if}
			{#if selected.instructions.length > 0}
				<div class="cat-modal-instr-head">Execução</div>
				<ol class="cat-modal-instr">
					{#each selected.instructions as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
{/if}

<style>
	.cat-main {
		padding: 28px 32px 64px;
		overflow-y: auto;
	}
	/* Tabs Catálogo / Meus exercícios */
	.ex-tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--ink-line);
		margin-bottom: 22px;
	}
	.ex-tab {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 11px 16px;
		font: 500 14px var(--font-sans);
		color: var(--ink-2);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 140ms var(--ease);
	}
	.ex-tab:hover {
		color: var(--ink-0);
	}
	.ex-tab.on {
		color: var(--ink-0);
		border-bottom-color: var(--accent);
	}
	.ex-tab-count {
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		background: var(--accent-wash);
		padding: 2px 7px;
		border-radius: var(--r-pill);
	}
	.cat-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}
	.cat-h1 {
		font: 600 26px var(--font-sans);
		letter-spacing: -0.022em;
		margin: 6px 0 6px;
		color: var(--ink-0);
	}
	.cat-sub {
		font: 400 14px/1.5 var(--font-sans);
		color: var(--ink-2);
		margin: 0;
		max-width: 560px;
	}
	.cat-back {
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.cat-back:hover {
		color: var(--ink-0);
	}
	.cat-search {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 44px;
		padding: 0 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		margin-bottom: 14px;
	}
	.cat-search input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
	}
	.cat-count {
		font: var(--label-mono);
		color: var(--ink-3);
		white-space: nowrap;
	}
	.cat-filters {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 22px;
	}
	.cat-filter-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.cat-filter-label {
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-right: 4px;
		min-width: 48px;
	}
	.cat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 14px;
	}
	.cat-card {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		overflow: hidden;
		transition: border-color 140ms var(--ease), transform 140ms var(--ease);
	}
	.cat-card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}
	.cat-card-video {
		aspect-ratio: 1;
		background: var(--bg-3);
		position: relative;
		overflow: hidden;
	}
	.cat-card-video video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.cat-card-novideo {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-3);
		font-size: 28px;
	}
	.cat-card-body {
		padding: 12px 14px;
	}
	.cat-card-name {
		font: 500 13.5px var(--font-sans);
		color: var(--ink-0);
		line-height: 1.35;
		text-transform: capitalize;
	}
	.cat-card-meta {
		font: var(--label-mono);
		color: var(--ink-3);
		margin-top: 4px;
		text-transform: capitalize;
	}
	.cat-empty {
		padding: 56px;
		text-align: center;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
	}
	.cat-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		margin-top: 28px;
	}
	.cat-page-btn {
		all: unset;
		cursor: pointer;
		padding: 9px 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 500 13px var(--font-sans);
		color: var(--ink-1);
		transition: all 140ms var(--ease);
	}
	.cat-page-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--ink-0);
	}
	.cat-page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.cat-page-info {
		font: var(--label-mono);
		color: var(--ink-2);
	}

	/* Modal */
	.cat-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 80;
		animation: cat-fade 180ms var(--ease);
	}
	.cat-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 90;
		width: calc(100% - 40px);
		max-width: 460px;
		max-height: 88vh;
		overflow-y: auto;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		box-shadow: var(--shadow-pop);
		animation: cat-pop 220ms var(--ease);
	}
	@keyframes cat-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes cat-pop {
		from {
			opacity: 0;
			transform: translate(-50%, -48%) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}
	.cat-modal-close {
		all: unset;
		cursor: pointer;
		position: absolute;
		top: 12px;
		right: 12px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		border-radius: 50%;
		color: var(--ink-0);
		font-size: 14px;
		z-index: 1;
	}
	.cat-modal-video {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		background: var(--bg-3);
		display: block;
	}
	.cat-modal-body {
		padding: 20px 22px 24px;
	}
	.cat-modal-title {
		font: 500 22px var(--font-sans);
		letter-spacing: -0.018em;
		margin: 6px 0 12px;
		color: var(--ink-0);
		text-transform: capitalize;
	}
	.cat-modal-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 14px;
	}
	.cat-modal-desc {
		font: 400 14px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0 0 16px;
	}
	.cat-modal-instr-head {
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 8px;
	}
	.cat-modal-instr {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.cat-modal-instr li {
		font: 400 13.5px/1.5 var(--font-sans);
		color: var(--ink-1);
	}

	@media (max-width: 1023px) {
		.cat-main {
			padding: 16px 16px 32px;
		}
		.cat-header {
			flex-direction: column;
			gap: 8px;
		}
		.cat-h1 {
			font-size: 22px;
		}
		.cat-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
		}
	}
</style>
