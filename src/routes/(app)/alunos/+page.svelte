<script lang="ts">
	import { Button, Chip, Avatar, StatusDot, ProgressBar, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { StudentListItem } from '$lib/server/queries';

	let { data }: { data: PageData } = $props();
	const students = $derived(data.students);

	let filter = $state<'all' | 'active' | 'paused'>('all');
	let goal = $state<string>('all');
	let q = $state('');
	let hover = $state<string | null>(null);
	let inputFocused = $state(false);

	const filtered = $derived(
		students.filter(
			(s) =>
				(filter === 'all' || s.status === filter) &&
				(goal === 'all' || s.goal === goal) &&
				(!q || s.name.toLowerCase().includes(q.toLowerCase()))
		)
	);

	const goalsAvailable = $derived(
		Array.from(new Set(students.map((s) => s.goal).filter((x): x is string => !!x)))
	);

	function adherenceColor(a: number) {
		if (a >= 85) return 'var(--success)';
		if (a >= 70) return 'var(--warn)';
		return 'var(--danger)';
	}

	function openStudent(s: StudentListItem) {
		goto(`/alunos/${s.id}`);
	}
</script>

<div class="page-body">
	<header class="al-header">
		<div>
			<Eyebrow>{students.length} alunos · {students.filter((s) => s.status === 'active').length} ativos</Eyebrow>
			<h1 class="al-h1">Alunos</h1>
		</div>
		<div class="al-actions">
			<div class="al-search" class:focused={inputFocused}>
				<span>⌕</span>
				<input
					bind:value={q}
					onfocus={() => (inputFocused = true)}
					onblur={() => (inputFocused = false)}
					placeholder="Buscar por nome…"
				/>
			</div>
			<Button onclick={() => goto('/alunos/novo')}>+ Novo</Button>
		</div>
	</header>

	<div class="al-main">
		<!-- Filters -->
		<div
			style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 16px;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2)"
		>
			<span class="eyebrow" style="margin-right:4px">STATUS</span>
			{#each [['all', 'Todos'], ['active', 'Ativos'], ['paused', 'Pausados']] as [k, l] (k)}
				<Chip active={filter === k} onclick={() => (filter = k as typeof filter)}>{l}</Chip>
			{/each}
			{#if goalsAvailable.length > 0}
				<div style="width:1px;height:18px;background:var(--ink-line);margin:0 6px"></div>
				<span class="eyebrow" style="margin-right:4px">OBJETIVO</span>
				<Chip active={goal === 'all'} onclick={() => (goal = 'all')}>Todos</Chip>
				{#each goalsAvailable as g (g)}
					<Chip active={goal === g} onclick={() => (goal = g)}>{g}</Chip>
				{/each}
			{/if}
		</div>

		{#if students.length === 0}
			<div class="card" style="padding:48px;text-align:center">
				<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">Nenhum aluno cadastrado</div>
				<div style="font:var(--body);color:var(--ink-2);max-width:420px;margin:0 auto 20px">
					Adicione seu primeiro aluno pra começar a prescrever planos.
				</div>
				<Button onclick={() => goto('/alunos/novo')}>+ Adicionar primeiro aluno</Button>
			</div>
		{:else}
			<!-- Tabela em desktop -->
			<div class="card students-table">
				<div class="students-thead">
					<span>Aluno</span><span>Plano</span><span>Aderência</span><span>7d sessões</span><span>Última</span><span>Streak</span><span></span>
				</div>
				{#each filtered as s (s.id)}
					<button
						type="button"
						onmouseenter={() => (hover = s.id)}
						onmouseleave={() => (hover = null)}
						onclick={() => openStudent(s)}
						class="students-row"
						class:hot={hover === s.id}
					>
						<div class="row-aluno">
							<Avatar name={s.name} size={36} />
							<div class="row-aluno-info">
								<div style="display:flex;align-items:center;gap:8px">
									<span style="font:500 14px var(--font-sans);color:var(--ink-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{s.name}</span>
									<StatusDot variant={s.status === 'active' ? 'success' : 'muted'} />
								</div>
								<div
									style="font:var(--label-mono);color:var(--ink-2);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
								>{s.age ? s.age + ' anos · ' : ''}{s.goal ?? 'sem objetivo'}</div>
							</div>
						</div>
						<div style="font:var(--body-sm);color:var(--ink-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
							{s.planTitle ?? '—'}
						</div>
						<div>
							<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
								<span class="num" style="font:500 13px var(--font-mono);color:{adherenceColor(s.adherence)}">{s.adherence}%</span>
								<span style="font:var(--label-mono);color:var(--ink-2)">aderência</span>
							</div>
							<ProgressBar value={s.adherence} color={adherenceColor(s.adherence)} height={3} />
						</div>
						<div style="display:flex;flex-direction:column">
							<span class="num" style="font:500 13px var(--font-mono);color:var(--ink-0)">{s.sessions7}/wk</span>
							<span style="font:var(--label-mono);color:var(--ink-2)">7d sessões</span>
						</div>
						<div class="num" style="font:500 13px var(--font-mono);color:var(--ink-1)">{s.last ?? '—'}</div>
						<div style="display:flex;align-items:center;gap:4px">
							<span style="color:var(--accent)">♦</span>
							<span class="num" style="font:500 13px var(--font-mono);color:var(--ink-0)">{s.streak}</span>
						</div>
						<span class="students-arrow" class:on={hover === s.id}>→</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div style="padding:32px;text-align:center;font:var(--body-sm);color:var(--ink-2);border-top:1px solid var(--ink-line)">
						Nenhum aluno com esses filtros.
					</div>
				{/if}
			</div>

			<!-- Cards em mobile -->
			<div class="students-cards">
				{#each filtered as s (s.id)}
					<button type="button" onclick={() => openStudent(s)} class="student-card">
						<div class="student-card__head">
							<Avatar name={s.name} size={42} />
							<div style="flex:1;min-width:0">
								<div style="display:flex;align-items:center;gap:6px">
									<span style="font:500 15px var(--font-sans);color:var(--ink-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
										{s.name}
									</span>
									<StatusDot variant={s.status === 'active' ? 'success' : 'muted'} />
								</div>
								<div class="student-card__sub">
									{s.age ? s.age + ' anos · ' : ''}{s.goal ?? 'sem objetivo'}
								</div>
							</div>
							<span style="color:var(--ink-3)">→</span>
						</div>
						{#if s.planTitle}
							<div class="student-card__plan">{s.planTitle}</div>
						{/if}
						<div class="student-card__metrics">
							<div>
								<div class="num student-card__num" style="color:{adherenceColor(s.adherence)}">{s.adherence}%</div>
								<div class="student-card__lbl">aderência</div>
							</div>
							<div>
								<div class="num student-card__num">{s.sessions7}</div>
								<div class="student-card__lbl">sessões / 7d</div>
							</div>
							<div>
								<div class="num student-card__num">
									<span style="color:var(--accent);margin-right:3px">♦</span>{s.streak}
								</div>
								<div class="student-card__lbl">streak</div>
							</div>
							<div>
								<div class="num student-card__num" style="color:var(--ink-1)">{s.last ?? '—'}</div>
								<div class="student-card__lbl">última</div>
							</div>
						</div>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div style="padding:24px;text-align:center;font:var(--body-sm);color:var(--ink-2);background:var(--bg-1);border:1px solid var(--ink-line);border-radius:var(--r-2)">
						Nenhum aluno com esses filtros.
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.page-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.al-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 32px;
		border-bottom: 1px solid var(--ink-line);
		background: var(--bg-1);
		position: sticky;
		top: 0;
		z-index: 10;
		gap: 14px;
	}
	/* Em telas largas, centraliza o conteúdo do header pra alinhar com .al-main */
	@media (min-width: 1024px) {
		.al-header {
			padding-left: max(32px, calc((100vw - 1440px) / 2 + 32px));
			padding-right: max(32px, calc((100vw - 1440px) / 2 + 32px));
		}
	}
	.al-h1 {
		margin: 6px 0 0;
		font: 600 22px var(--font-sans);
		letter-spacing: -0.015em;
	}
	.al-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.al-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 38px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		font: var(--body-sm);
		color: var(--ink-2);
		min-width: 280px;
		transition: all 140ms var(--ease);
	}
	.al-search.focused {
		border-color: var(--accent);
	}
	.al-search input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
		min-width: 0;
	}
	.al-main {
		padding: 24px 32px 64px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
		flex: 1;
		max-width: 1440px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
	}

	/* Cards visível só em mobile */
	.students-cards {
		display: none;
	}
	.students-thead,
	.students-row {
		display: grid;
		/* Aluno (avatar + nome+idade) + Plano + Aderência (mais espaço pro
		   bar) + 3 métricas compactas no fim. Proporção 1.4 : 1.1 : 1.3 :
		   métricas fixas dá distribuição equilibrada em telas largas
		   sem buraco gigante no meio.
		   minmax(0, fr) é OBRIGATÓRIO — sem isso, conteúdo longo (ex:
		   planTitle "O plano de treino para Matheus, de 21 anos…") força
		   a col a expandir além do fr, desalinhando rows entre si. */
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 1.3fr) 96px 88px 72px 32px;
		gap: 18px;
		align-items: center;
		padding: 12px 18px;
	}
	/* Defesa: TODO filho direto das rows tem min-width 0 + overflow hidden
	   pra garantir alinhamento mesmo se algum conteúdo passar batido sem
	   text-overflow:ellipsis. */
	.students-row > * {
		min-width: 0;
		overflow: hidden;
	}
	.students-thead {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--bg-1);
	}
	.students-thead :global(.thead-aluno) {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.students-row {
		all: unset;
		cursor: pointer;
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 1.3fr) 96px 88px 72px 32px;
		padding: 14px 18px;
		border-top: 1px solid var(--ink-line);
		transition: background 140ms var(--ease);
	}
	.row-aluno {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
	}
	.row-aluno-info {
		min-width: 0;
		flex: 1;
	}
	.students-row.hot {
		background: var(--bg-2);
	}
	.students-arrow {
		color: var(--ink-2);
		font-size: 16px;
		transition: all 140ms;
		opacity: 0.4;
	}
	.students-arrow.on {
		transform: translateX(4px);
		opacity: 1;
	}
	.students-table {
		padding: 0;
		overflow: hidden;
	}

	@media (max-width: 1023px) {
		.al-header {
			padding: 14px 18px;
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}
		.al-h1 {
			font: 600 20px var(--font-sans);
		}
		.al-actions {
			width: 100%;
			gap: 8px;
		}
		.al-search {
			min-width: 0;
			flex: 1;
			height: 40px;
		}
		.al-main {
			padding: 14px 14px 32px;
			gap: 14px;
		}
		.students-table {
			display: none;
		}
		.students-cards {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
	}

	.student-card {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		transition: border-color 140ms var(--ease), background 140ms var(--ease);
	}
	.student-card:active {
		background: var(--bg-2);
		border-color: var(--ink-line-2);
	}
	.student-card__head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.student-card__sub {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 2px;
	}
	.student-card__plan {
		font: var(--body-sm);
		color: var(--ink-1);
		padding: 8px 10px;
		background: var(--bg-2);
		border-radius: var(--r-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.student-card__metrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--ink-line);
	}
	.student-card__num {
		font: 500 14px var(--font-mono);
		color: var(--ink-0);
		font-variant-numeric: tabular-nums;
	}
	.student-card__lbl {
		font: 500 9px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-top: 2px;
	}
</style>
