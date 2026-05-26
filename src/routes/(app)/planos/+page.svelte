<script lang="ts">
	import { Button, Chip, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const plans = $derived(data.plans);

	let view = $state<'grid' | 'list'>('grid');
	let filter = $state<'all' | 'active' | 'archived'>('all');

	const filtered = $derived(
		plans.filter((p) => {
			if (filter === 'all') return true;
			if (filter === 'active') return p.isActive;
			return !p.isActive;
		})
	);
</script>

<div class="planos-main">
	<header class="planos-header">
		<div style="flex:1;min-width:0">
			<Eyebrow>{plans.length} planos · {plans.filter((p) => p.isActive).length} ativos</Eyebrow>
			<h1 class="planos-h1">Planos</h1>
			<p class="planos-sub">
				Histórico de planos prescritos. Cada um foi gerado com base no perfil clínico do aluno.
			</p>
		</div>
		<div class="planos-actions">
			<Button variant="secondary">Exportar</Button>
			<Button>+ Novo</Button>
		</div>
	</header>

	{#if plans.length === 0}
		<div class="card" style="padding:48px;text-align:center">
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">Nenhum plano gerado ainda</div>
			<div style="font:var(--body);color:var(--ink-2);max-width:420px;margin:0 auto 20px">
				Vá para a ficha de um aluno e clique em "Gerar plano" pra criar o primeiro.
			</div>
			<Button onclick={() => goto('/dashboard')}>Ver alunos</Button>
		</div>
	{:else}
		<div
			style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2);margin-bottom:20px"
		>
			<div style="display:flex;gap:6px;flex-wrap:wrap;flex:1">
				{#each [['all', 'Todos'], ['active', 'Ativos'], ['archived', 'Encerrados']] as [k, l] (k)}
					<Chip active={filter === k} onclick={() => (filter = k as typeof filter)}>{l}</Chip>
				{/each}
			</div>
			<div
				style="display:flex;gap:4px;padding:4px;background:var(--bg-1);border-radius:var(--r-2);border:1px solid var(--ink-line)"
			>
				{#each ['grid', 'list'] as v (v)}
					<button
						onclick={() => (view = v as typeof view)}
						style="padding:6px 10px;font:var(--label-mono);color:{view === v
							? 'var(--ink-0)'
							: 'var(--ink-3)'};background:{view === v
							? 'var(--bg-3)'
							: 'transparent'};border:0;border-radius:6px;cursor:pointer;text-transform:uppercase"
					>{v === 'grid' ? '▦' : '☰'} {v}</button>
				{/each}
			</div>
		</div>

		{#if view === 'grid'}
			<div class="planos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">
				{#each filtered as p (p.id)}
					<button
						type="button"
						onclick={() => goto(`/planos/${p.id}`)}
						class="card"
						style="all:unset;cursor:pointer;display:block;padding:0;overflow:hidden;background:var(--bg-2);border:1px solid {p.isActive
							? 'var(--accent-dim)'
							: 'var(--ink-line)'};border-radius:var(--r-3)"
					>
						<div
							style="padding:14px 18px;border-bottom:1px solid var(--ink-line);display:flex;justify-content:space-between;align-items:center;background:var(--bg-3)"
						>
							<span style="font:var(--label-mono);color:{p.isActive ? 'var(--accent)' : 'var(--ink-2)'}"
								>{p.isActive ? '● ATIVO' : '○ ENCERRADO'}</span
							>
							<span style="font:var(--label-mono);color:var(--ink-3)"
								>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</span
							>
						</div>

						<div style="padding:20px">
							<div style="font:var(--label-mono);color:var(--ink-3);margin-bottom:6px">{p.studentName}</div>
							<h3 style="font:600 15px var(--font-sans);letter-spacing:-0.005em;margin:0 0 16px;color:var(--ink-0);line-height:1.4">
								{p.title}
							</h3>

							<div style="display:flex;gap:24px;padding:12px 0;border-top:1px solid var(--ink-line);border-bottom:1px solid var(--ink-line)">
								<div>
									<div class="num" style="font:var(--num-md);color:var(--ink-0);line-height:1">{p.sessionsTotal}</div>
									<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">SESSÕES</div>
								</div>
								<div>
									<div style="font:500 16px var(--font-sans);color:var(--ink-0);line-height:1.2;text-transform:capitalize">
										{p.status}
									</div>
									<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">STATUS</div>
								</div>
							</div>

							<div
								style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;font:var(--label-mono);color:var(--ink-3)"
							>
								<span>VER DETALHES</span>
								<span style="color:var(--accent)">→</span>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="card" style="padding:0">
				<div class="planos-list-head">
					{#each ['Aluno', 'Plano', 'Sessões', 'Status', 'Criado', ''] as h (h)}
						<div class="eyebrow">{h}</div>
					{/each}
				</div>
				{#each filtered as p, i (p.id)}
					<button
						type="button"
						onclick={() => goto(`/planos/${p.id}`)}
						class="planos-list-row"
						class:last={i === filtered.length - 1}
					>
						<div class="cell-aluno" style="font:500 14px var(--font-sans);color:var(--ink-0)">{p.studentName}</div>
						<div class="cell-plano" style="font:var(--body-sm);color:var(--ink-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
							{p.title}
						</div>
						<div class="cell-sessoes num" style="font:500 14px var(--font-mono);color:var(--ink-0)">{p.sessionsTotal}</div>
						<div class="cell-status"><Chip variant={p.isActive ? 'active' : 'default'}>{p.status}</Chip></div>
						<div class="cell-data num" style="font:var(--label-mono);color:var(--ink-2)">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</div>
						<span class="cell-arrow" style="color:var(--accent);text-align:right">→</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.planos-main {
		overflow-y: auto;
		padding: 32px 40px 64px;
	}
	.planos-header {
		margin-bottom: 28px;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
	}
	.planos-h1 {
		font: 600 28px var(--font-sans);
		margin: 8px 0 0;
		letter-spacing: -0.025em;
	}
	.planos-sub {
		font: 400 15px var(--font-sans);
		color: var(--ink-2);
		margin: 6px 0 0;
		max-width: 560px;
	}
	.planos-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.planos-list-head {
		display: grid;
		grid-template-columns: 1.5fr 2fr 100px 100px 120px 60px;
		gap: 16px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--ink-line-2);
		background: var(--bg-3);
	}
	.planos-list-row {
		all: unset;
		cursor: pointer;
		display: grid;
		grid-template-columns: 1.5fr 2fr 100px 100px 120px 60px;
		gap: 16px;
		padding: 14px 20px;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		border-bottom: 1px solid var(--ink-line);
	}
	.planos-list-row.last {
		border-bottom: 0;
	}
	@media (max-width: 1023px) {
		.planos-main {
			padding: 16px 14px 32px;
		}
		.planos-header {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		.planos-h1 {
			font-size: 22px;
		}
		.planos-sub {
			font-size: 13px;
		}
		.planos-actions {
			gap: 6px;
		}
		.planos-actions :global(.pf-btn) {
			flex: 1;
			justify-content: center;
		}
		.planos-grid {
			grid-template-columns: 1fr !important;
		}
		/* Lista compacta: header some, linha vira card de 2 linhas */
		.planos-list-head {
			display: none;
		}
		.planos-list-row {
			grid-template-columns: 1fr auto;
			grid-template-areas:
				'aluno arrow'
				'plano data'
				'sessoes status';
			row-gap: 6px;
			padding: 14px 16px;
		}
		.cell-aluno {
			grid-area: aluno;
		}
		.cell-plano {
			grid-area: plano;
			max-width: 100%;
		}
		.cell-data {
			grid-area: data;
			text-align: right;
		}
		.cell-arrow {
			grid-area: arrow;
		}
		.cell-sessoes {
			grid-area: sessoes;
			justify-self: start;
		}
		.cell-sessoes::after {
			content: ' sessões';
			font: var(--label-mono);
			color: var(--ink-3);
		}
		.cell-status {
			grid-area: status;
			justify-self: end;
		}
	}
</style>
