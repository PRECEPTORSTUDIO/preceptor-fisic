<script lang="ts">
	import { Button, Chip, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const exercises = $derived(data.exercises);

	let g = $state('Todos');
	let e = $state('Todos');
	let q = $state('');
	let sel = $state<(typeof exercises)[number] | null>(exercises[0] ?? null);
	let inputFocused = $state(false);

	const groups = $derived(['Todos', ...Array.from(new Set(exercises.map((x) => x.muscleGroup)))]);
	const equips = $derived(['Todos', ...Array.from(new Set(exercises.map((x) => x.equipment).filter((x): x is string => !!x)))]);

	const filt = $derived(
		exercises.filter(
			(x) =>
				(g === 'Todos' || x.muscleGroup === g) &&
				(e === 'Todos' || x.equipment === e) &&
				(!q || x.name.toLowerCase().includes(q.toLowerCase()))
		)
	);
</script>

<div style="display:grid;grid-template-columns:1fr 420px;height:100vh;overflow:hidden">
	<div style="overflow-y:auto;padding:28px 40px 64px;border-right:1px solid var(--ink-line)">
		<div class="ex-tabs">
			<a href="/exercicios" class="ex-tab" data-sveltekit-noscroll>Catálogo</a>
			<a href="/exercicios/meus" class="ex-tab on">
				Meus exercícios
				<span class="ex-tab-count">{exercises.length}</span>
			</a>
		</div>

		<header style="margin-bottom:24px">
			<Eyebrow>Customizados por você · usados nos planos</Eyebrow>
			<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;gap:12px;flex-wrap:wrap">
				<h1 style="font:var(--display-md);margin:0;letter-spacing:-0.025em">Meus exercícios</h1>
				<Button onclick={() => goto('/exercicios/novo')}>+ Novo</Button>
			</div>
		</header>

		{#if exercises.length === 0}
			<div class="card" style="padding:48px;text-align:center">
				<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:8px">Biblioteca vazia</div>
				<div style="font:var(--body);color:var(--ink-2);margin-bottom:20px">Adicione exercícios pra reusar nos planos.</div>
				<Button onclick={() => goto('/exercicios/novo')}>+ Adicionar primeiro exercício</Button>
			</div>
		{:else}
			<div style="margin-bottom:16px">
				<input
					bind:value={q}
					onfocus={() => (inputFocused = true)}
					onblur={() => (inputFocused = false)}
					placeholder="⌕  Buscar exercício, padrão de movimento, equipamento…"
					style="width:100%;padding:12px 16px;background:var(--bg-2);color:var(--ink-0);border:1px solid {inputFocused
						? 'var(--accent)'
						: 'var(--ink-line)'};border-radius:var(--r-2);font:var(--body) var(--font-sans);outline:none;box-sizing:border-box"
				/>
			</div>

			<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
				<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
					<span class="eyebrow" style="min-width:80px">GRUPO</span>
					{#each groups as c (c)}
						<Chip active={g === c} onclick={() => (g = c)}>{c}</Chip>
					{/each}
				</div>
				<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
					<span class="eyebrow" style="min-width:80px">EQUIP.</span>
					{#each equips as c (c)}
						<Chip active={e === c} onclick={() => (e = c)}>{c}</Chip>
					{/each}
				</div>
			</div>

			<div class="card" style="padding:0">
				<div
					style="display:grid;grid-template-columns:90px 2fr 1.4fr 1fr 1fr 80px;gap:12px;padding:10px 18px;border-bottom:1px solid var(--ink-line-2);background:var(--bg-3)"
				>
					{#each ['ID', 'Nome', 'Grupo', 'Equip.', 'Padrão', 'Usos'] as h (h)}
						<div class="eyebrow">{h}</div>
					{/each}
				</div>
				{#each filt as x, i (x.id)}
					{@const active = sel?.id === x.id}
					<button
						type="button"
						onclick={() => (sel = x)}
						style="all:unset;cursor:pointer;display:grid;grid-template-columns:90px 2fr 1.4fr 1fr 1fr 80px;gap:12px;padding:12px 18px;align-items:center;width:100%;box-sizing:border-box;{i <
						filt.length - 1
							? 'border-bottom:1px solid var(--ink-line)'
							: ''};background:{active
							? 'var(--accent-wash)'
							: 'transparent'};position:relative"
					>
						{#if active}
							<span style="position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)"></span>
						{/if}
						<div class="num" style="font:var(--label-mono);color:var(--ink-3)">{x.code ?? '—'}</div>
						<div style="font:500 14px var(--font-sans);color:var(--ink-0)">{x.name}</div>
						<div style="font:var(--body-sm);color:var(--ink-1)">{x.muscleGroup}</div>
						<div style="font:var(--body-sm);color:var(--ink-2)">{x.equipment ?? '—'}</div>
						<div style="font:var(--label-mono);color:var(--accent)">{x.pattern?.toUpperCase() ?? '—'}</div>
						<div class="num" style="font:500 14px var(--font-mono);color:var(--ink-1);text-align:right">{x.uses}</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if sel}
		<aside style="overflow-y:auto;padding:32px 28px 64px;background:var(--bg-1)">
			<div style="font:var(--label-mono);color:var(--ink-3);margin-bottom:8px">{sel.code ?? sel.id.slice(0, 8)} · PRÉ-VISUALIZAÇÃO</div>
			<h2 style="font:var(--display-md);margin:0 0 8px;letter-spacing:-0.02em;line-height:1.05">{sel.name}</h2>
			<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">
				<Chip variant="active">{sel.muscleGroup}</Chip>
				{#if sel.equipment}<Chip>{sel.equipment}</Chip>{/if}
				{#if sel.level}<Chip>{sel.level}</Chip>{/if}
			</div>

			<div
				style="aspect-ratio:16/11;background:var(--bg-3);border-radius:var(--r-3);border:1px solid var(--ink-line);display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:20px;overflow:hidden"
			>
				<svg viewBox="0 0 100 100" style="width:56px;height:56px;opacity:0.85">
					<circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="2" />
					<polygon points="42,33 42,67 70,50" fill="var(--accent)" />
				</svg>
				<span style="position:absolute;bottom:12px;right:14px;font:var(--label-mono);color:var(--ink-2)">VÍDEO · em breve</span>
			</div>

			<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
				<div class="card" style="padding:16px">
					<Eyebrow>Padrão</Eyebrow>
					<div style="font:600 18px var(--font-sans);color:var(--ink-0);margin-top:4px">{sel.pattern ?? '—'}</div>
				</div>
				<div class="card" style="padding:16px">
					<Eyebrow>Usos no app</Eyebrow>
					<div class="num" style="font:var(--num-md);color:var(--ink-0);margin-top:4px">{sel.uses}</div>
				</div>
			</div>

			{#if sel.executionNotes}
				<div style="margin-bottom:20px">
					<Eyebrow>Forma de execução</Eyebrow>
					<p style="font:var(--body);color:var(--ink-1);margin:8px 0 0;line-height:1.5">{sel.executionNotes}</p>
				</div>
			{/if}

			{#if sel.contraindications.length > 0}
				<div style="margin-bottom:20px">
					<Eyebrow>Contraindicações</Eyebrow>
					<ul style="margin:8px 0 0;padding:0 0 0 18px;font:var(--body);color:var(--ink-1);line-height:1.6">
						{#each sel.contraindications as c (c)}
							<li>{c}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div style="display:flex;gap:8px">
				<Button style="flex:1" onclick={() => sel && goto(`/exercicios/${sel.id}/editar`)}>✎ Editar exercício</Button>
			</div>
		</aside>
	{/if}
</div>

<style>
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
</style>
