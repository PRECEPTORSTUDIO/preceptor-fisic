<script lang="ts">
	import { Button, Chip, Sparkline, Avatar, StatusDot, ProgressBar, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { StudentListItem } from '$lib/server/queries';

	let { data }: { data: PageData } = $props();
	const students = $derived(data.students);
	const stats = $derived(data.stats);

	let filter = $state<'all' | 'active' | 'paused'>('all');
	let goal = $state<string>('all');
	let hover = $state<string | null>(null);

	const filtered = $derived(
		students.filter(
			(s) => (filter === 'all' || s.status === filter) && (goal === 'all' || s.goal === goal)
		)
	);

	const goalsAvailable = $derived(
		Array.from(new Set(students.map((s) => s.goal).filter((x): x is string => !!x)))
	);

	const statCards = $derived([
		{
			label: 'Alunos ativos',
			value: String(stats?.activeStudents ?? 0),
			unit: '',
			delta: stats?.activeStudents ? '+0' : null,
			deltaPositive: true,
			spark: undefined as number[] | undefined,
			sparkColor: 'var(--accent)'
		},
		{
			label: 'Aderência média',
			value: students.length
				? String(Math.round(students.reduce((a, s) => a + s.adherence, 0) / students.length))
				: '0',
			unit: '%',
			delta: null,
			deltaPositive: true,
			spark: undefined as number[] | undefined,
			sparkColor: 'var(--accent)'
		},
		{
			label: 'Treinos esta sem.',
			value: String(stats?.sessionsThisWeek ?? 0),
			unit: '',
			delta: null,
			deltaPositive: true,
			spark: undefined as number[] | undefined,
			sparkColor: 'var(--success)'
		},
		{
			label: 'Planos ativos',
			value: String(stats?.activePlans ?? 0),
			unit: '',
			delta: null,
			deltaPositive: true,
			spark: undefined as number[] | undefined,
			sparkColor: 'var(--warn)'
		}
	]);

	// Upcoming appointments próximos 7 dias (vem do server, real)
	const upcoming = $derived.by(() => {
		const apps = stats?.upcomingAppointments ?? [];
		if (apps.length === 0) {
			return [
				{ day: 'Hoje', label: 'Sem agendamentos', color: 'var(--ink-3)' }
			];
		}
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const dayLabel = (d: Date) => {
			const diff = Math.floor(
				(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
					startOfToday.getTime()) /
					86400000
			);
			if (diff === 0) return 'Hoje';
			if (diff === 1) return 'Amanhã';
			return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
		};
		return apps.slice(0, 5).map((a) => {
			const d = new Date(a.startsAt);
			const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
			return {
				day: dayLabel(d),
				label: `${time} · ${a.studentName ?? 'Sessão'}`,
				color: 'var(--accent)'
			};
		});
	});

	// Heatmap: cells vêm do server (1 cell por dia, últimos 182 dias).
	// Buckets relativos ao max do período pra escalar bem em qualquer volume.
	const heatmapColors = [
		'var(--bg-3)',
		'rgba(167,139,250,0.18)',
		'rgba(167,139,250,0.4)',
		'rgba(167,139,250,0.7)',
		'var(--accent)'
	];
	const cells = $derived.by(() => {
		const raw = stats?.heatmap ?? [];
		const max = stats?.heatmapMax ?? 1;
		// Mapeia count → bucket 0..4
		return raw.map((count) => {
			if (count === 0) return 0;
			const ratio = count / max;
			if (ratio < 0.25) return 1;
			if (ratio < 0.5) return 2;
			if (ratio < 0.8) return 3;
			return 4;
		});
	});

	function adherenceColor(a: number) {
		if (a >= 85) return 'var(--success)';
		if (a >= 70) return 'var(--warn)';
		return 'var(--danger)';
	}

	function openStudent(s: StudentListItem) {
		goto(`/alunos/${s.id}`);
	}

	const today = new Date();
	const weekday = today.toLocaleDateString('pt-BR', { weekday: 'long' });
	const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
</script>

<header class="dash-header">
	<div>
		<h1 class="dash-h1">Visão geral</h1>
		<div class="dash-sub">
			{weekday} · {dateStr} · {stats?.activeStudents ?? 0} alunos ativos
		</div>
	</div>
	<div class="dash-actions">
		<div class="dash-search">
			<span>⌕</span>
			<span>Buscar aluno, exercício, plano…</span>
			<span class="num dash-kbd">⌘K</span>
		</div>
		<Button onclick={() => goto('/alunos/novo')}>+ Novo aluno</Button>
	</div>
</header>

<div class="dash-main">
	<!-- Stat grid -->
	<div class="dash-stats">
		{#each statCards as s (s.label)}
			<div class="card" style="padding:20px;position:relative">
				<div style="display:flex;align-items:flex-start;justify-content:space-between">
					<Eyebrow>{s.label}</Eyebrow>
					{#if s.delta}
						<span
							style="font:var(--label-mono);color:{s.deltaPositive
								? 'var(--success)'
								: 'var(--danger)'};padding:3px 8px;background:{s.deltaPositive
								? 'var(--success-dim)'
								: 'var(--danger-dim)'};border-radius:var(--r-pill)"
						>{s.deltaPositive ? '↑' : '↓'} {s.delta}</span>
					{/if}
				</div>
				<div style="display:flex;align-items:baseline;gap:6px;margin-top:14px">
					<span class="num" style="font:var(--num-lg);color:var(--ink-0)">{s.value}</span>
					{#if s.unit}<span style="font:var(--num-sm);color:var(--ink-2)">{s.unit}</span>{/if}
				</div>
				{#if s.spark}
					<div style="margin-top:12px"><Sparkline data={s.spark} width={220} height={36} color={s.sparkColor} /></div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Heatmap + lembretes -->
	<div class="dash-mid">
		<div class="card dash-heatmap-card">
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
				<div>
					<Eyebrow>Atividade da turma · 26 sem</Eyebrow>
					<div style="font:var(--title-lg);color:var(--ink-0);margin-top:4px">
						{stats?.sessionsThisWeek ?? 0} sessões esta semana
					</div>
				</div>
				<div
					style="display:flex;align-items:center;gap:6px;font:var(--label-mono);color:var(--ink-2);text-transform:uppercase;letter-spacing:0.08em"
				>
					<span>menos</span>
					{#each [0, 1, 2, 3, 4] as i (i)}
						<div style="width:10px;height:10px;border-radius:2px;background:{heatmapColors[i]}"></div>
					{/each}
					<span>mais</span>
				</div>
			</div>
			<div style="display:grid;grid-template-columns:repeat(26,1fr);gap:3px">
				{#each Array(26) as _, w (w)}
					<div style="display:grid;grid-template-rows:repeat(7,1fr);gap:3px">
						{#each Array(7) as __, d (d)}
							<div
								style="aspect-ratio:1;border-radius:3px;background:{heatmapColors[cells[w * 7 + d] ?? 0]}"
							></div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
		<div class="card">
			<Eyebrow>Próximos 7 dias</Eyebrow>
			<div style="margin-top:14px;display:flex;flex-direction:column">
				{#each upcoming as x, i (x.day + x.label)}
					<div
						style="display:flex;align-items:center;gap:12px;padding:10px 0;{i
							? 'border-top:1px solid var(--ink-line)'
							: ''}"
					>
						<div style="width:6px;height:6px;border-radius:50%;background:{x.color};flex-shrink:0"></div>
						<span style="font:500 13px var(--font-sans);color:var(--ink-0);min-width:70px">{x.day}</span>
						<span style="font:var(--body-sm);color:var(--ink-1);flex:1">{x.label}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Students list -->
	<div>
		<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
			<div>
				<Eyebrow>Alunos</Eyebrow>
				<div style="font:var(--title-lg);color:var(--ink-0);margin-top:4px">
					Lista da turma ·
					<span class="num" style="color:var(--ink-2)">{filtered.length}/{students.length}</span>
				</div>
			</div>
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				{#each [['all', 'Todos'], ['active', 'Ativos'], ['paused', 'Pausados']] as [k, l] (k)}
					<Chip active={filter === k} onclick={() => (filter = k as typeof filter)}>{l}</Chip>
				{/each}
				{#if goalsAvailable.length > 0}
					<div style="width:1px;background:var(--ink-line);margin:0 4px"></div>
					<Chip active={goal === 'all'} onclick={() => (goal = 'all')}>Todos objetivos</Chip>
					{#each goalsAvailable as g (g)}
						<Chip active={goal === g} onclick={() => (goal = g)}>{g}</Chip>
					{/each}
				{/if}
			</div>
		</div>

		{#if students.length === 0}
			<div class="card" style="padding:48px;text-align:center">
				<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">
					Nenhum aluno cadastrado
				</div>
				<div style="font:var(--body);color:var(--ink-2);max-width:420px;margin:0 auto 20px">
					Adicione seu primeiro aluno pra começar a prescrever planos baseados em diretrizes clínicas.
				</div>
				<Button onclick={() => goto('/alunos/novo')}>+ Adicionar primeiro aluno</Button>
			</div>
		{:else}
			<!-- Tabela em desktop, cards em mobile -->
			<div class="card students-table">
				<div class="students-thead">
					<span></span><span>Aluno</span><span>Plano</span><span>Aderência</span><span>7d sessões</span><span>Última</span><span>Streak</span><span></span>
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
						<Avatar name={s.name} size={36} />
						<div>
							<div style="display:flex;align-items:center;gap:8px">
								<span style="font:500 14px var(--font-sans);color:var(--ink-0)">{s.name}</span>
								<StatusDot variant={s.status === 'active' ? 'success' : 'muted'} />
							</div>
							<div
								style="font:var(--label-mono);color:var(--ink-2);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px"
							>{s.age ? s.age + ' anos · ' : ''}{s.goal ?? 'sem objetivo'}</div>
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
						<span
							class="students-arrow"
							class:on={hover === s.id}
						>→</span>
					</button>
				{/each}
			</div>

			<!-- Cards (visível só em mobile via @media) -->
			<div class="students-cards">
				{#each filtered as s (s.id)}
					<button
						type="button"
						onclick={() => openStudent(s)}
						class="student-card"
					>
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
								<div class="num student-card__num" style="color:{adherenceColor(s.adherence)}">
									{s.adherence}%
								</div>
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
								<div class="num student-card__num" style="color:var(--ink-1)">
									{s.last ?? '—'}
								</div>
								<div class="student-card__lbl">última</div>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.dash-header {
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
	.dash-h1 {
		margin: 0;
		font: 600 22px var(--font-sans);
		letter-spacing: -0.015em;
	}
	.dash-sub {
		font: var(--body-sm);
		color: var(--ink-2);
		margin-top: 2px;
	}
	.dash-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.dash-search {
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
		min-width: 240px;
	}
	.dash-kbd {
		margin-left: auto;
		font: var(--label-mono);
		padding: 2px 6px;
		background: var(--bg-3);
		border-radius: 4px;
		border: 1px solid var(--ink-line-2);
	}

	.dash-main {
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 28px;
		overflow-y: auto;
	}
	.dash-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	.dash-mid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 16px;
	}

	/* Tabela visível só em desktop, cards visíveis só em mobile */
	.students-cards {
		display: none;
	}
	.students-thead,
	.students-row {
		display: grid;
		grid-template-columns: 40px 2fr 1fr 1fr 100px 80px 60px 40px;
		gap: 18px;
		align-items: center;
		padding: 12px 18px;
	}
	.students-thead {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--bg-1);
	}
	.students-row {
		all: unset;
		cursor: pointer;
		display: grid;
		grid-template-columns: 40px 2fr 1fr 1fr 100px 80px 60px 40px;
		padding: 14px 18px;
		border-top: 1px solid var(--ink-line);
		transition: background 140ms var(--ease);
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

	/* ─────── MOBILE ─────── */
	@media (max-width: 1023px) {
		.dash-header {
			padding: 14px 18px;
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}
		.dash-h1 {
			font: 600 20px var(--font-sans);
		}
		.dash-actions {
			width: 100%;
			gap: 8px;
		}
		.dash-search {
			display: none; /* removido em mobile — usa search dedicado depois */
		}
		.dash-actions :global(.pf-btn) {
			flex: 1;
			justify-content: center;
		}

		.dash-main {
			padding: 18px;
			gap: 22px;
		}
		.dash-stats {
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
		}
		.dash-stats :global(.card) {
			padding: 14px;
		}

		.dash-mid {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.dash-heatmap-card {
			display: none; /* heatmap pesado — escondido em mobile */
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
