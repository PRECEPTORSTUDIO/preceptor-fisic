<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { PlanExercise } from '$lib/server/queries';

	let { data }: { data: PageData } = $props();
	const plan = $derived(data.plan);
	const planData = $derived(plan.planData);
	const sessions = $derived(planData.weekly_sessions ?? []);
	const aerobics = $derived(planData.aerobic_prescriptions ?? []);
	const pro = $derived(data.professional);
	const studentDetail = $derived(data.studentDetail);
	const student = $derived(studentDetail?.student);
	const prefs = $derived(studentDetail?.preferences);

	const age = $derived.by(() => {
		if (!student?.birthDate) return null;
		// birthDate é coluna `date` (string 'YYYY-MM-DD') — parse local, sem
		// new Date(string) que interpreta UTC e erra no dia do aniversário.
		const [by, bm, bd] = String(student.birthDate).split('-').map(Number);
		if (!by || !bm || !bd) return null;
		const now = new Date();
		let a = now.getFullYear() - by;
		if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) a--;
		return a;
	});

	function fmtDate(d: Date | string | null | undefined): string {
		if (!d) return '—';
		// String date-only ('YYYY-MM-DD') formata direto — new Date() parsearia
		// como meia-noite UTC e imprimiria 1 dia a menos no fuso do Brasil.
		if (typeof d === 'string') {
			const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
			if (m) return `${m[3]}/${m[2]}/${m[1]}`;
		}
		return new Date(d).toLocaleDateString('pt-BR');
	}

	// ── Período do programa ──
	// Sem program_weeks definido pela IA, não fabrica "16 semanas" no documento.
	const startDate = $derived(new Date(plan.publishedAt ?? plan.createdAt));
	const programWeeks = $derived(planData.program_weeks ?? null);
	const endDate = $derived(
		programWeeks ? new Date(startDate.getTime() + programWeeks * 7 * 86_400_000) : null
	);

	// ── Objetivo (capa) ──
	const GOAL_LABELS: Record<string, string> = {
		emagrecimento: 'emagrecimento',
		hipertrofia: 'hipertrofia',
		forca: 'ganho de força',
		condicionamento_cardiovascular: 'condicionamento cardiovascular',
		qualidade_de_vida: 'qualidade de vida e saúde geral',
		reabilitacao: 'reabilitação',
		performance: 'performance'
	};
	const goalsText = $derived(
		((prefs?.goals as string[] | null) ?? []).map((g) => GOAL_LABELS[g] ?? g).join(', ')
	);
	const objective = $derived(
		planData.objective ||
			(goalsText ? `Promover ${goalsText} por meio do programa de treinamento prescrito.` : '') ||
			planData.summary ||
			'—'
	);

	// ── Letra da sessão de força (A, B, C...) ──
	const LETTERS = 'ABCDEFGH';
	function sessionLetter(i: number): string {
		return LETTERS[i] ?? String(i + 1);
	}

	// ── Agenda semanal ──
	const WEEKDAYS = [
		{ key: 'dom', label: 'Dom' },
		{ key: 'seg', label: 'Seg' },
		{ key: 'ter', label: 'Ter' },
		{ key: 'qua', label: 'Qua' },
		{ key: 'qui', label: 'Qui' },
		{ key: 'sex', label: 'Sex' },
		{ key: 'sab', label: 'Sáb' }
	];
	const scheduleItems = $derived([
		...sessions.map((s, i) => ({
			label: `Treino de Força ${sessionLetter(i)}`,
			day: s.day_of_week ?? null
		})),
		...aerobics.map((a) => ({
			label: `Treino Aeróbio${a.means ? ' · ' + a.means : ''}${a.weekly_frequency ? ' (' + a.weekly_frequency + ')' : ''}`,
			day: null as string | null
		}))
	]);
	function sessionsForDay(key: string) {
		return scheduleItems.filter((it) => it.day === key);
	}

	// ── Helpers de exibição da ficha ──
	const MUSCLE_ACTION_LABEL: Record<string, string> = {
		isotonica: 'Isotônica',
		isometrica: 'Isométrica',
		auxotonico: 'Auxotônico',
		isocinetica: 'Isocinética'
	};
	function fmtRest(ex: PlanExercise): string {
		if (ex.rest_label) return ex.rest_label;
		const s = ex.rest_seconds;
		if (s == null) return '-';
		if (s === 0) return '-';
		return s % 60 === 0 ? `${s / 60}min` : `${s}s`;
	}
	function fmtSeries(ex: PlanExercise): string {
		return ex.series_label ?? (ex.sets != null ? String(ex.sets) : '-');
	}
	function fmtIntensity(ex: PlanExercise): string {
		// Mostra % de 1RM (intensity) e PSE (load_guidance) lado a lado quando
		// ambos existem. Cada um sozinho aparece como fallback.
		const parts = [ex.intensity, ex.load_guidance].map((p) => p?.trim()).filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : '-';
	}
	function fmtCadence(ex: PlanExercise): string {
		return ex.cadence || ex.tempo || '-';
	}
	function fmtAction(ex: PlanExercise): string {
		return ex.muscle_action ? (MUSCLE_ACTION_LABEL[ex.muscle_action] ?? '-') : '-';
	}
	function fmtRom(ex: PlanExercise): string {
		return ex.range_of_motion || '-';
	}

	// Linhas da tabela de força: aquecimento (marcado) + principal + volta à calma
	function strengthRows(s: (typeof sessions)[number]) {
		const rows: { ex: PlanExercise; tag?: string }[] = [];
		for (const ex of s.warmup ?? []) rows.push({ ex, tag: 'aquecimento' });
		for (const ex of s.main ?? []) rows.push({ ex });
		for (const ex of s.cooldown ?? []) rows.push({ ex, tag: 'volta à calma' });
		return rows;
	}

	function doPrint() {
		window.print();
	}
	const today = new Date().toLocaleDateString('pt-BR');

	const proTitle = $derived(
		(pro.specialty ? pro.specialty.replace(/_/g, ' ') : 'Profissional de Educação Física')
	);
</script>

<svelte:head>
	<title>Prescrição · {student?.name ?? '—'} · {today}</title>
</svelte:head>

<!-- Floating actions (não imprime) -->
<div class="no-print actions-bar">
	<button class="back" onclick={() => goto(`/planos/${plan.id}`)}>← Voltar</button>
	<button class="print-btn" onclick={doPrint}>⎙ Imprimir / Salvar PDF</button>
</div>

<!-- Snippet do rodapé com assinatura (repete em cada página) -->
{#snippet signature()}
	<div class="signature">
		<div class="sig-line"></div>
		<div class="sig-name">{pro.name}</div>
		<div class="sig-sub">{proTitle}</div>
		<div class="sig-sub">{pro.cref ? `CREF ${pro.cref.replace(/^CREF\s*/i, '')}` : 'CREF —'}</div>
	</div>
{/snippet}

{#snippet pageHeader()}
	<div class="page-head">
		<div class="ph-brand">{pro.name}</div>
		<div class="ph-student">
			{student?.name ?? '—'}
			{#if student?.birthDate}<span> · Nasc.: {fmtDate(student.birthDate)}</span>{/if}
			{#if age != null}<span> · {age} anos</span>{/if}
		</div>
	</div>
{/snippet}

<div class="print-root">
	<!-- ═══════════ CAPA ═══════════ -->
	<article class="page">
		{@render pageHeader()}

		<div class="cover-title">Prescrição de Exercício Físico</div>

		<section class="cover-block">
			<div class="cover-lbl">Aluno(a)</div>
			<div class="cover-val">{student?.name ?? '—'}</div>
			<div class="cover-meta">
				{#if student?.birthDate}Data de nascimento: {fmtDate(student.birthDate)}{/if}
				{#if age != null} · Idade: {age} anos{/if}
			</div>
		</section>

		<section class="cover-block">
			<div class="cover-lbl">Objetivo</div>
			<p class="cover-text">{objective}</p>
		</section>

		<section class="cover-block">
			<div class="cover-lbl">Programa semanal</div>
			<table class="tbl schedule">
				<thead>
					<tr>
						{#each WEEKDAYS as d (d.key)}<th>{d.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						{#each WEEKDAYS as d (d.key)}
							<td>
								{#each sessionsForDay(d.key) as it (it.label)}
									<div class="sched-cell">{it.label}</div>
								{/each}
							</td>
						{/each}
					</tr>
				</tbody>
			</table>
			<ul class="sched-legend">
				{#each scheduleItems as it (it.label)}
					<li>{it.label}{it.day ? ` — ${WEEKDAYS.find((w) => w.key === it.day)?.label}` : ''}</li>
				{/each}
			</ul>
		</section>

		<section class="cover-block">
			<div class="cover-lbl">Período de realização do programa</div>
			<div class="cover-val small">
				{#if programWeeks && endDate}
					{fmtDate(startDate)} a {fmtDate(endDate)} ({programWeeks} semanas)
				{:else}
					Início em {fmtDate(startDate)} · término a definir pelo profissional
				{/if}
			</div>
		</section>

		{@render signature()}
	</article>

	<!-- ═══════════ TREINOS DE FORÇA ═══════════ -->
	{#each sessions as s, i (i)}
		<article class="page break-before">
			{@render pageHeader()}
			<div class="train-title">TREINO DE FORÇA {sessionLetter(i)}</div>
			{#if s.focus}<div class="train-focus">{s.focus}</div>{/if}

			<table class="tbl strength">
				<colgroup>
					<col style="width:23%" />
					<col style="width:13%" />
					<col style="width:7%" />
					<col style="width:10%" />
					<col style="width:8%" />
					<col style="width:13%" />
					<col style="width:10%" />
					<col style="width:16%" />
				</colgroup>
				<thead>
					<tr>
						<th class="col-ex">Exercício</th>
						<th>Intensidade</th>
						<th>Séries</th>
						<th>Repetições</th>
						<th>Pausa</th>
						<th>Ação muscular</th>
						<th>Cadência</th>
						<th>Amplitude</th>
					</tr>
				</thead>
				<tbody>
					{#each strengthRows(s) as row (row.ex.name + (row.tag ?? ''))}
						<tr>
							<td class="col-ex">
								<span class="ex-name">{row.ex.name}</span>
								{#if row.tag}<span class="ex-tag">({row.tag})</span>{/if}
							</td>
							<td>{fmtIntensity(row.ex)}</td>
							<td>{fmtSeries(row.ex)}</td>
							<td>{row.ex.reps ?? '-'}</td>
							<td>{fmtRest(row.ex)}</td>
							<td>{fmtAction(row.ex)}</td>
							<td>{fmtCadence(row.ex)}</td>
							<td>{fmtRom(row.ex)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if s.observations}
				<div class="obs"><strong>Observações:</strong> {s.observations}</div>
			{/if}

			{@render signature()}
		</article>
	{/each}

	<!-- ═══════════ TREINO AERÓBIO ═══════════ -->
	{#if aerobics.length > 0}
		<article class="page break-before">
			{@render pageHeader()}
			<div class="train-title">TREINO AERÓBIO</div>

			{#each aerobics as a (a.means + a.intensity)}
				<table class="tbl aerobic">
					<thead>
						<tr>
							<th>Meio</th>
							<th>Método</th>
							<th>Pausa</th>
							<th>Intensidade</th>
							<th>Volume</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{a.means}{a.weekly_frequency ? ` (${a.weekly_frequency})` : ''}</td>
							<td>{a.method}</td>
							<td>{a.pause || '-'}</td>
							<td>{a.intensity}</td>
							<td>{a.volume}</td>
						</tr>
					</tbody>
				</table>
			{/each}

			{#if aerobics.some((a) => a.observations)}
				<div class="obs">
					<strong>Observações:</strong>
					{aerobics
						.map((a) => a.observations)
						.filter(Boolean)
						.join(' ')}
				</div>
			{/if}

			{@render signature()}
		</article>
	{/if}
</div>

<style>
	:global(body) {
		background: #fff;
	}
	/* Paleta do design system (violet accent) sobre papel branco. */
	.print-root {
		--accent: #a78bfa;
		--accent-dark: #6d5fa3;
		--accent-wash: #f4f0fd;
		--ink: #1a1a1a;
		--ink-2: #555;
		--line: #d8d4e3;
		--zebra: #f8f6fd;
		--font-print: 'Geist Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		padding: 24px 0 80px;
		background: #fff;
	}

	.page {
		width: 210mm;
		min-height: 297mm;
		box-sizing: border-box;
		padding: 18mm 16mm 16mm;
		background: #fff;
		color: var(--ink);
		font: 400 11px/1.45 var(--font-print);
		position: relative;
		display: flex;
		flex-direction: column;
		/* Divisor sutil entre páginas na visualização (escondido no print).
		   Sem sombra/papel-sobre-mesa: fundo branco contínuo, só uma linha
		   tênue marca onde uma página termina e a outra começa. */
	}
	.page + .page {
		border-top: 1px dashed var(--line);
	}

	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		padding-bottom: 8px;
		margin-bottom: 18px;
		border-bottom: 2px solid var(--accent);
	}
	.ph-brand {
		font: 700 15px var(--font-print);
		color: var(--accent-dark);
		letter-spacing: -0.01em;
	}
	.ph-student {
		font-size: 10.5px;
		color: var(--ink-2);
		text-align: right;
	}

	/* ── Capa ── */
	.cover-title {
		font: 700 26px var(--font-print);
		color: var(--accent-dark);
		letter-spacing: -0.02em;
		margin: 8px 0 24px;
	}
	.cover-block {
		margin-bottom: 22px;
	}
	.cover-lbl {
		font: 700 10px var(--font-print);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--accent-dark);
		margin-bottom: 6px;
	}
	.cover-val {
		font: 600 18px var(--font-print);
		color: var(--ink);
	}
	.cover-val.small {
		font-size: 14px;
	}
	.cover-meta {
		font-size: 11px;
		color: #555;
		margin-top: 3px;
	}
	.cover-text {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.6;
		color: #222;
	}
	.sched-legend {
		margin: 10px 0 0;
		padding-left: 18px;
		font-size: 11px;
		color: #333;
	}
	.sched-legend li {
		margin-bottom: 2px;
	}
	.sched-cell {
		font-size: 9.5px;
		line-height: 1.25;
		margin-bottom: 2px;
	}

	/* ── Títulos de treino ── */
	.train-title {
		font: 700 18px var(--font-print);
		color: #fff;
		background: var(--accent);
		padding: 9px 14px;
		border-radius: 4px 4px 0 0;
		letter-spacing: 0.02em;
		font-style: italic;
	}
	.train-focus {
		font-size: 11px;
		color: #555;
		margin: 6px 0 10px;
	}

	/* ── Tabelas ── */
	.tbl {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0;
		font-size: 10.5px;
	}
	/* table-layout fixed + colgroup: 8 colunas cabem na largura do A4 e o texto
	   quebra em vez de estourar pra fora da folha (o que cortava Cadência e
	   Amplitude no PDF). */
	.strength {
		table-layout: fixed;
	}
	.tbl th {
		background: var(--accent);
		color: #fff;
		font-weight: 600;
		text-align: center;
		padding: 7px 6px;
		border: 1px solid var(--accent-dark);
		vertical-align: middle;
	}
	.tbl td {
		border: 1px solid var(--line);
		padding: 7px 6px;
		text-align: center;
		vertical-align: middle;
		word-break: break-word;
		overflow-wrap: anywhere;
	}
	.tbl tbody tr:nth-child(even) td {
		background: var(--zebra);
	}
	.strength .col-ex,
	.tbl .col-ex {
		text-align: left;
		/* largura vem do <colgroup> (table-layout:fixed) */
	}
	.ex-name {
		font-weight: 600;
	}
	.ex-tag {
		display: block;
		font-size: 9px;
		color: #777;
		font-style: italic;
	}
	.schedule th,
	.schedule td {
		width: 14.28%;
	}
	.schedule td {
		height: 54px;
		vertical-align: top;
		text-align: center;
	}

	.obs {
		margin-top: 10px;
		font-size: 11px;
		color: #333;
		padding: 8px 10px;
		background: var(--zebra);
		border-left: 3px solid var(--accent);
	}

	/* ── Assinatura ── */
	.signature {
		margin-top: auto;
		padding-top: 28px;
		text-align: center;
		align-self: center;
	}
	.sig-line {
		width: 240px;
		border-top: 1px solid #333;
		margin: 0 auto 6px;
	}
	.sig-name {
		font-weight: 700;
		font-size: 12px;
	}
	.sig-sub {
		font-size: 10px;
		color: #555;
	}

	/* ── Toolbar ── */
	.actions-bar {
		position: fixed;
		top: 16px;
		right: 16px;
		display: flex;
		gap: 8px;
		z-index: 100;
	}
	.actions-bar .back,
	.actions-bar .print-btn {
		height: 40px;
		padding: 0 18px;
		border-radius: 8px;
		cursor: pointer;
		font: 500 14px var(--font-print);
		border: none;
		color: #fff;
	}
	.actions-bar .back {
		background: #444;
	}
	.actions-bar .print-btn {
		background: var(--accent);
	}

	/* ── Impressão ── */
	@media print {
		:global(body) {
			background: #fff;
		}
		.no-print {
			display: none !important;
		}
		.print-root {
			padding: 0;
			gap: 0;
		}
		.page {
			/* CRÍTICO: na visualização .page é flex-column (com signature em
			   margin-top:auto). Mas um contêiner flex-column NÃO pagina o conteúdo
			   que transborda entre folhas — o navegador CORTA no fim da 1ª página
			   física. Era por isso que a impressão saía só com parte do Treino A.
			   Em impressão voltamos pro fluxo de bloco normal, que pagina tabelas
			   longas corretamente. */
			display: block;
			width: auto;
			min-height: 0;
			box-shadow: none;
			padding: 12mm 12mm 10mm;
		}
		.page + .page {
			border-top: none;
		}
		.break-before {
			break-before: page;
			page-break-before: always;
		}
		/* Sem flex, a assinatura volta ao fluxo normal logo após o conteúdo. */
		.signature {
			margin-top: 24px;
		}
		/* Tabela longa pode atravessar folhas, mas nunca quebrar no meio de uma
		   linha; o cabeçalho se repete no topo de cada folha. */
		.tbl tr {
			break-inside: avoid;
			page-break-inside: avoid;
		}
		.tbl thead {
			display: table-header-group;
		}
		@page {
			size: A4;
			margin: 0;
		}
	}
</style>
