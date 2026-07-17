<script lang="ts">
	import { Button, Chip, Sparkline, LoadChart, Eyebrow, toast } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { computeAcwr } from '$lib/training-metrics';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const detail = $derived(data.detail);
	const student = $derived(detail.student);
	const hp = $derived(detail.healthProfile);
	const prefs = $derived(detail.preferences);
	const plans = $derived(detail.plans);
	const lastWeights = $derived(detail.lastWeights);
	const alunoUrl = $derived(data.alunoUrl);
	const fillUrl = $derived(data.fillUrl);
	const profilePending = $derived(!student.profileCompletedAt);
	const loadEvolution = $derived(data.loadEvolution);
	// Risco carga interna×externa (#3) — ACWR sobre a carga interna semanal.
	const acwr = $derived(computeAcwr(loadEvolution.weeks));
	const acwrColor: Record<string, string> = {
		sem_dados: 'var(--ink-3)',
		baixa: 'var(--info)',
		otima: 'var(--success)',
		atencao: 'var(--warn)',
		alto_risco: 'var(--danger)'
	};
	// Plano ativo — alvo do CTA "Ajustar carga" quando o ACWR está em risco.
	const activePlanId = $derived(plans.find((p) => p.isActive)?.id ?? null);
	const acwrEmRisco = $derived(acwr.level === 'atencao' || acwr.level === 'alto_risco');

	// Histórico de sessões — expõe PSE + observações que hoje só entram no agregado.
	const recentSessions = $derived(data.recentSessions ?? []);
	function pseColor(pse: number | null): string {
		if (pse == null) return 'var(--ink-3)';
		return pse >= 9 ? 'var(--danger)' : pse >= 7 ? 'var(--warn)' : 'var(--success)';
	}
	function fmtSessionDate(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'short',
			weekday: 'short'
		}).replace('.', '');
	}

	let tab = $state<'dados' | 'plan' | 'prog'>('dados');

	let showLinkModal = $state(false);
	let resending = $state(false);

	// Rótulo do card de plano pelo status real — plano gerando ou com falha
	// não pode aparecer como "Encerrado".
	const planChip = (p: { isActive: boolean; status: string }) =>
		p.isActive
			? { label: '● Ativo', variant: 'active' as const }
			: p.status === 'pending' || p.status === 'generating'
				? { label: '⟳ Gerando…', variant: 'warn' as const }
				: p.status === 'failed'
					? { label: 'Falhou', variant: 'danger' as const }
					: { label: 'Encerrado', variant: 'default' as const };

	async function copyLinkToClipboard() {
		try {
			await navigator.clipboard.writeText(alunoUrl);
			toast.success('Link copiado.');
		} catch {
			toast.error('Não foi possível copiar — selecione o texto acima manualmente.');
		}
	}

	async function copyFillLink() {
		try {
			await navigator.clipboard.writeText(fillUrl);
			toast.success('Link de preenchimento copiado.');
		} catch {
			toast.error('Não foi possível copiar.');
		}
	}

	// Texto sugerido pra mensagem (vai pra wa.me e mailto:)
	const linkPitch = $derived(
		`Olá ${student.name.split(' ')[0]}, esse é o link do seu app de treinos. Sem login — clique e já abre:\n${alunoUrl}`
	);
	// wa.me exige formato internacional completo: 10-11 dígitos = formato
	// local BR (DDD + número) → prefixa 55. Decisão por comprimento (não
	// startsWith('55')) pra não quebrar DDD 55 (RS).
	const whatsappPhone = $derived.by(() => {
		if (!student.phone) return null;
		const d = student.phone.replace(/\D/g, '');
		return d.length === 10 || d.length === 11 ? `55${d}` : d;
	});
	const whatsappUrl = $derived(
		whatsappPhone
			? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(linkPitch)}`
			: `https://wa.me/?text=${encodeURIComponent(linkPitch)}`
	);
	const mailtoUrl = $derived(
		student.email
			? `mailto:${student.email}?subject=${encodeURIComponent('Seu app de treinos — Preceptor Fisic')}&body=${encodeURIComponent(linkPitch)}`
			: null
	);

	const HIGH_RISK_KEYS = ['cardiopatia', 'avc', 'dpoc', 'diabetes tipo 1', 'stent', 'insuficiência'];
	function isHighRisk(c: string) {
		return HIGH_RISK_KEYS.some((r) => c.toLowerCase().includes(r));
	}

	const age = $derived.by(() => {
		if (!student.birthDate) return null;
		const b = new Date(student.birthDate);
		const now = new Date();
		let a = now.getFullYear() - b.getFullYear();
		const m = now.getMonth() - b.getMonth();
		if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
		return a;
	});

	const weight = $derived(student.weightKg ?? 0);
	const height = $derived(student.heightCm ?? 0);
	const bmi = $derived(height > 0 ? (weight / Math.pow(height / 100, 2)).toFixed(1) : '—');
	const bmiCat = $derived(
		bmi === '—'
			? '—'
			: Number(bmi) < 18.5
				? 'baixo peso'
				: Number(bmi) < 25
					? 'normal'
					: Number(bmi) < 30
						? 'sobrepeso'
						: 'obeso'
	);
	const bmiColor = $derived(
		bmi === '—' || (Number(bmi) < 18.5 || Number(bmi) >= 30)
			? 'var(--danger)'
			: Number(bmi) >= 25
				? 'var(--warn)'
				: 'var(--success)'
	);

	const initials = $derived(
		student.name
			.split(' ')
			.map((n) => n[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const wDelta = $derived(
		lastWeights.length >= 2
			? (lastWeights[lastWeights.length - 1]! - lastWeights[0]!).toFixed(1) + 'kg'
			: '0kg'
	);
	const wTrend = $derived(
		lastWeights.length >= 2
			? lastWeights[lastWeights.length - 1]! < lastWeights[0]!
				? 'down'
				: lastWeights[lastWeights.length - 1]! > lastWeights[0]!
					? 'up'
					: 'flat'
			: 'flat'
	);

	const diagnoses = $derived((hp?.diagnoses as { label: string; severity?: string }[] | null) ?? []);
	const meds = $derived((hp?.medications as { name: string; dose?: string; frequency?: string }[] | null) ?? []);
	const limitations = $derived(
		(hp?.injuries as { region: string; notes?: string }[] | null)?.map((i) => i.region + (i.notes ? ' · ' + i.notes : '')) ??
			(hp?.contraindications as { exercise_pattern: string; reason: string }[] | null)?.map(
				(c) => c.exercise_pattern + ' · ' + c.reason
			) ??
			[]
	);

	const hasRisk = $derived(diagnoses.some((d) => isHighRisk(d.label)));

	const goalsList = $derived((prefs?.goals as string[] | null) ?? []);
	const GOAL_LABELS: Record<string, string> = {
		emagrecimento: 'Emagrecimento',
		hipertrofia: 'Hipertrofia',
		forca: 'Força',
		condicionamento_cardiovascular: 'Cardio',
		qualidade_de_vida: 'Saúde geral',
		reabilitacao: 'Reabilitação',
		performance: 'Performance'
	};
	const primaryGoal = $derived(goalsList[0] ? (GOAL_LABELS[goalsList[0]] ?? goalsList[0]) : 'sem objetivo');

	type RiskLevel = 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string }> = {
		baixo: { label: 'Baixo', color: 'var(--success)', bg: 'var(--success-dim)' },
		moderado: { label: 'Moderado', color: 'var(--warn)', bg: 'var(--warn-dim)' },
		alto: { label: 'Alto', color: 'var(--danger)', bg: 'var(--danger-dim)' },
		muito_alto: { label: 'Muito alto', color: 'var(--danger)', bg: 'var(--danger-dim)' }
	};

	const heroStats = $derived([
		{
			lbl: 'Peso',
			val: weight ? weight.toFixed(1) : '—',
			unit: 'kg',
			spark: lastWeights.length > 1 ? lastWeights : undefined,
			delta: lastWeights.length > 1 ? wDelta : undefined,
			trend: wTrend,
			color: 'var(--ink-0)'
		},
		{ lbl: 'Altura', val: height || '—', unit: 'cm', color: 'var(--ink-0)', spark: undefined, delta: undefined, trend: undefined },
		{ lbl: 'IMC', val: bmi, unit: bmiCat, color: bmiColor, spark: undefined, delta: undefined, trend: undefined },
		{ lbl: 'Sexo', val: student.sex.charAt(0).toUpperCase() + student.sex.slice(1).replace('_', ' '), unit: '', color: 'var(--ink-0)', spark: undefined, delta: undefined, trend: undefined },
		{ lbl: 'Risco CV', val: RISK_META[data.effectiveRisk].label, unit: '', color: RISK_META[data.effectiveRisk].color, spark: undefined, delta: undefined, trend: undefined }
	]);

	// ── Estratificação de risco cardiovascular (sugerir + confirmar) ──────────
	const cvRisk = $derived(data.cvRisk);
	const currentRisk = $derived(data.currentRisk);
	// Valor do <select> — inicia na sugestão; o profissional confirma ou troca.
	let selectedRisk = $state<RiskLevel>('baixo');
	$effect(() => {
		selectedRisk = cvRisk.level;
	});
	let savingRisk = $state(false);
	const riskDiverges = $derived(currentRisk !== null && currentRisk !== cvRisk.level);

	const trendIcon = (t: string | undefined) => (t === 'down' ? '↘' : t === 'up' ? '↗' : '→');
	const trendColor = (t: string | undefined) =>
		t === 'down' ? 'var(--success)' : t === 'up' ? 'var(--warn)' : 'var(--ink-2)';

	const since = $derived(
		new Date(student.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
	);
</script>

<svelte:head>
	<title>{student?.name ?? 'Aluno'} · Preceptor Fisic</title>
</svelte:head>

<div style="flex:1;overflow-y:auto;background:var(--bg-0)">
	<!-- Breadcrumb -->
	<div
		style="padding:20px 32px;border-bottom:1px solid var(--ink-line);display:flex;align-items:center;gap:16px;background:var(--bg-1)"
	>
		<button
			onclick={() => goto('/dashboard')}
			style="background:var(--bg-3);border:1px solid var(--ink-line-2);cursor:pointer;width:36px;height:36px;border-radius:var(--r-1);color:var(--ink-1);display:flex;align-items:center;justify-content:center;font:400 18px var(--font-sans)"
		>←</button>
		<span style="font:var(--body-sm);color:var(--ink-2)">Alunos</span>
		<span style="color:var(--ink-3)">/</span>
		<span style="font:var(--body-sm);color:var(--ink-1)">{student.name}</span>
	</div>

	<!-- Hero -->
	<div
		style="background:linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);border-bottom:1px solid var(--ink-line);padding:32px 32px 0;position:relative;overflow:hidden"
	>
		<div
			style="position:absolute;top:-120px;right:-60px;width:420px;height:420px;background:radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);pointer-events:none"
		></div>

		<div
			style="display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:flex-start;position:relative"
		>
			<div
				style="width:96px;height:96px;border-radius:var(--r-3);background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%);display:flex;align-items:center;justify-content:center;font:500 36px var(--font-sans);color:#0a0a0a;box-shadow:var(--glow-accent);letter-spacing:-0.02em"
			>{initials}</div>

			<div style="padding-top:6px">
				<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
					<h1 style="margin:0;font:500 32px var(--font-sans);color:var(--ink-0);letter-spacing:-0.02em">{student.name}</h1>
					{#if hasRisk}
						<span
							style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r-pill);background:var(--danger-dim);color:var(--danger);font:var(--label-mono);text-transform:uppercase;letter-spacing:0.08em;border:1px solid var(--danger)"
						>⚠ Atenção clínica</span>
					{/if}
				</div>
				<div style="display:flex;gap:24px;font:var(--body);color:var(--ink-2);flex-wrap:wrap">
					{#if age}
						<span><span style="color:var(--ink-1)">{age}</span> anos</span>
						<span style="color:var(--ink-line-2)">·</span>
					{/if}
					<span><span style="color:var(--accent)">{primaryGoal}</span></span>
					<span style="color:var(--ink-line-2)">·</span>
					<span>desde {since}</span>
					{#if plans.some((p) => p.isActive)}
						<span style="color:var(--ink-line-2)">·</span>
						<span>plano <span style="color:var(--success)">● ativo</span></span>
					{/if}
				</div>
			</div>

			<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
				<Button variant="secondary" size="md" onclick={() => (showLinkModal = true)} title={alunoUrl}>🔗 Link do aluno</Button>
				<Button variant="secondary" size="md" onclick={() => goto(`/alunos/${student.id}/editar`)}>Editar</Button>
				<Button variant="secondary" size="md" onclick={() => goto('/mensagens')}>Mensagem</Button>
				<Button size="md" onclick={() => goto(`/alunos/${student.id}/gerar`)}>+ Gerar plano</Button>
			</div>
		</div>

		<!-- Quick stats strip -->
		<div
			style="margin-top:32px;display:grid;grid-template-columns:repeat(5,1fr);gap:0;border-top:1px solid var(--ink-line);position:relative"
		>
			{#each heroStats as s, i (s.lbl)}
				<div style="padding:20px 24px;{i < 4 ? 'border-right:1px solid var(--ink-line)' : ''}">
					<div class="eyebrow" style="margin-bottom:10px">{s.lbl}</div>
					<div style="display:flex;align-items:baseline;gap:6px">
						<span class="num" style="font:var(--num-lg);color:{s.color}">{s.val}</span>
						{#if s.unit}<span style="font:var(--label-mono);color:var(--ink-2)">{s.unit}</span>{/if}
					</div>
					{#if s.spark}
						<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
							<Sparkline data={s.spark} width={80} height={20} color={trendColor(s.trend)} />
							<span style="font:var(--label-mono);color:{trendColor(s.trend)}">{trendIcon(s.trend)} {s.delta}</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Cadastro pendente: aluno criado via link e ainda não preencheu os dados. -->
	{#if profilePending}
		<div style="padding:0 32px;margin-top:20px">
			<div
				style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 20px;border-radius:var(--r-3);background:var(--accent-wash);border:1px solid var(--accent)"
			>
				<span style="font-size:20px">⏳</span>
				<div style="flex:1;min-width:200px">
					<div style="font:600 14px var(--font-sans);color:var(--ink-0)">Aguardando preenchimento do aluno</div>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-top:2px">
						Envie o link pro aluno completar perfil clínico e preferências.
					</div>
				</div>
				<Button variant="secondary" size="md" onclick={copyFillLink} title={fillUrl}>📋 Copiar link de preenchimento</Button>
			</div>
		</div>
	{/if}

	<!-- Evolução de carga — DESTAQUE no topo, sempre visível (não só na aba
	     Progresso). É a resposta de "o aluno está evoluindo?" num relance. -->
	{#if loadEvolution.hasData}
		<div class="load-hero">
			<div class="card load-hero-card">
				<div class="load-hero-head">
					<div>
						<Eyebrow>◆ Evolução de carga — está evoluindo?</Eyebrow>
						<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-top:4px">
							Carga externa × interna · 12 semanas
						</div>
					</div>
					<span class="load-hero-hint">
						Trabalho feito (tonelagem) × esforço pago (PSE × duração)
					</span>
				</div>
				{#if acwr.ratio !== null}
					<div
						style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border-radius:var(--r-2);background:var(--bg-2);border:1px solid var(--ink-line);border-left:3px solid {acwrColor[acwr.level]}"
					>
						<span style="font:600 12px var(--font-sans);color:{acwrColor[acwr.level]};text-transform:uppercase;letter-spacing:0.04em">
							Risco: {acwr.label}
						</span>
						<span style="font:500 11px var(--font-mono);color:var(--ink-2);font-variant-numeric:tabular-nums">
							ACWR {acwr.ratio.toFixed(2)} · aguda {acwr.acute} / crônica {acwr.chronic} UA
						</span>
						<span style="flex:1;min-width:140px;font:var(--body-sm);color:var(--ink-2)">{acwr.hint}</span>
						{#if acwrEmRisco && activePlanId}
							<Button variant="secondary" size="sm" onclick={() => goto(`/planos/${activePlanId}`)}>
								Ajustar carga →
							</Button>
						{/if}
					</div>
				{/if}
				<LoadChart weeks={loadEvolution.weeks} externalMetric={loadEvolution.externalMetric} />
			</div>
		</div>
	{:else}
		<div class="load-hero">
			<div class="card load-hero-empty">
				<span style="font:600 15px var(--font-sans);color:var(--accent)">◆</span>
				<span style="font:var(--body-sm);color:var(--ink-2)">
					<b style="color:var(--ink-1);font-weight:500">Evolução de carga</b> — o gráfico de carga
					externa × interna aparece aqui assim que o aluno registrar treinos com PSE e carga no app.
				</span>
			</div>
		</div>
	{/if}

	<!-- Tabs -->
	<div style="padding:0 32px;border-bottom:1px solid var(--ink-line);background:var(--bg-1)">
		<div style="display:flex;gap:32px">
			{#each [['dados', 'Dados clínicos', undefined], ['plan', 'Planos', plans.length], ['prog', 'Progresso', undefined]] as [key, label, count] (key)}
				{@const active = tab === key}
				<button
					onclick={() => (tab = key as typeof tab)}
					style="background:transparent;border:0;cursor:pointer;padding:14px 0;font:500 14px var(--font-sans);color:{active
						? 'var(--ink-0)'
						: 'var(--ink-2)'};position:relative;display:flex;align-items:center;gap:8px"
				>
					{label}
					{#if count != null}
						<span
							style="font:var(--label-mono);color:{active
								? 'var(--accent)'
								: 'var(--ink-3)'};padding:2px 7px;border-radius:99px;background:{active
								? 'var(--accent-wash)'
								: 'var(--bg-3)'}"
						>{count}</span>
					{/if}
					{#if active}
						<span
							style="position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--accent);border-radius:1px"
						></span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<div style="padding:28px 32px 80px">
		{#if tab === 'dados'}
			<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px">
				<div style="display:flex;flex-direction:column;gap:16px">
					<!-- Histórico médico -->
					<div class="card" style="padding:24px">
						<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
							<div style="width:32px;height:32px;border-radius:var(--r-1);background:var(--danger-dim);display:flex;align-items:center;justify-content:center;color:var(--danger)">+</div>
							<div style="font:500 16px var(--font-sans);color:var(--ink-0)">Histórico médico</div>
						</div>
						{#if diagnoses.length === 0}
							<div style="font:var(--body-sm);color:var(--ink-2)">Nenhuma condição registrada</div>
						{:else}
							<div style="display:flex;flex-wrap:wrap;gap:8px">
								{#each diagnoses as d, i (d.label + i)}
									{@const risk = isHighRisk(d.label)}
									<span
										style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r-pill);font:500 12px var(--font-sans);background:{risk
											? 'var(--danger-dim)'
											: 'var(--bg-3)'};color:{risk
											? 'var(--danger)'
											: 'var(--ink-1)'};border:1px solid {risk ? 'var(--danger)' : 'var(--ink-line-2)'}"
									>
										{#if risk}<span>⚠</span>{/if}
										{d.label}{d.severity ? ' · ' + d.severity : ''}
									</span>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Estratificação de risco cardiovascular (automática, ACSM adaptado) -->
					<div class="card" style="padding:24px">
						<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px">
							<div style="display:flex;align-items:center;gap:10px">
								<div style="width:32px;height:32px;border-radius:var(--r-1);background:{RISK_META[cvRisk.level].bg};display:flex;align-items:center;justify-content:center;color:{RISK_META[cvRisk.level].color};font:600 15px var(--font-sans)">♥</div>
								<div style="font:500 16px var(--font-sans);color:var(--ink-0)">Risco cardiovascular</div>
							</div>
							<span
								style="padding:4px 10px;border-radius:var(--r-pill);font:600 12px var(--font-sans);background:{RISK_META[cvRisk.level].bg};color:{RISK_META[cvRisk.level].color}"
							>
								Sugerido: {RISK_META[cvRisk.level].label}
							</span>
						</div>

						<div style="font:var(--label-mono);color:var(--ink-2);margin-bottom:10px">
							Estratificação automática · confiança {cvRisk.confidence}
						</div>

						<!-- Por quê -->
						<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
							{#each cvRisk.reasons as r, i (r + i)}
								<div style="font:var(--body-sm);color:var(--ink-1)">• {r}</div>
							{/each}
						</div>

						<!-- Fatores de risco contados -->
						{#if cvRisk.factors.length > 0}
							<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
								{#each cvRisk.factors as f (f.code)}
									<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--r-pill);font:500 11px var(--font-sans);background:var(--bg-3);color:var(--ink-1);border:1px solid var(--ink-line-2)">
										{f.label}{f.detail ? ' · ' + f.detail : ''}
									</span>
								{/each}
							</div>
						{/if}

						{#if riskDiverges}
							<div style="font:var(--body-sm);color:var(--warn);margin-bottom:12px">
								⚠ Valor atual no perfil: {RISK_META[currentRisk as RiskLevel]?.label ?? currentRisk}. Confirme ou ajuste abaixo.
							</div>
						{/if}

						<!-- Confirmar / sobrescrever -->
						<form
							method="POST"
							action="?/applyCvRisk"
							use:enhance={() => {
								savingRisk = true;
								return async ({ result, update }) => {
									savingRisk = false;
									if (result.type === 'success') toast.success('Risco cardiovascular atualizado');
									else if (result.type === 'failure')
										toast.error(String(result.data?.error ?? 'Falha ao salvar'));
									await update({ reset: false });
								};
							}}
							style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"
						>
							<select
								name="level"
								bind:value={selectedRisk}
								style="flex:1;min-width:140px;padding:9px 12px;border-radius:var(--r-2);background:var(--bg-3);color:var(--ink-0);border:1px solid var(--ink-line-2);font:var(--body-sm)"
							>
								<option value="baixo">Baixo</option>
								<option value="moderado">Moderado</option>
								<option value="alto">Alto</option>
								<option value="muito_alto">Muito alto</option>
							</select>
							<Button type="submit" size="sm" disabled={savingRisk}>
								{savingRisk ? 'Salvando…' : 'Confirmar'}
							</Button>
						</form>

						{#if cvRisk.dataGaps.length > 0}
							<div style="margin-top:12px;font:var(--body-sm);color:var(--ink-2)">
								Dados que melhorariam a precisão: {cvRisk.dataGaps.join(' · ')}
							</div>
						{/if}
					</div>

					<!-- Medicações -->
					<div class="card" style="padding:24px">
						<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
							<div style="width:32px;height:32px;border-radius:var(--r-1);background:var(--accent-wash);display:flex;align-items:center;justify-content:center;color:var(--accent);font:500 16px var(--font-sans)">℞</div>
							<div style="font:500 16px var(--font-sans);color:var(--ink-0)">Medicações em uso</div>
						</div>
						{#if meds.length === 0}
							<div style="font:var(--body-sm);color:var(--ink-2)">Nenhuma medicação registrada</div>
						{:else}
							<div style="display:flex;flex-direction:column;gap:1px">
								{#each meds as m, i (m.name + i)}
									<div
										style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:12px 0;{i
											? 'border-top:1px solid var(--ink-line)'
											: ''}"
									>
										<span style="font:var(--body);color:var(--ink-0)">{m.name}{m.dose ? ' · ' + m.dose : ''}</span>
										<span style="font:var(--label-mono);color:var(--ink-2)">{m.frequency ?? 'contínuo'}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Limitações físicas -->
					<div class="card" style="padding:24px">
						<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
							<div style="width:32px;height:32px;border-radius:var(--r-1);background:var(--warn-dim);display:flex;align-items:center;justify-content:center;color:var(--warn)">⚠</div>
							<div style="font:500 16px var(--font-sans);color:var(--ink-0)">Limitações físicas</div>
						</div>
						{#if limitations.length === 0}
							<div style="font:var(--body-sm);color:var(--ink-2)">Sem limitações</div>
						{:else}
							<div style="display:flex;flex-direction:column;gap:10px">
								{#each limitations as l, i (l + i)}
									<div
										style="display:flex;gap:12px;padding:14px;background:var(--warn-dim);border-radius:var(--r-2);border:1px solid var(--warn);border-left-width:4px"
									>
										<span style="font:var(--body);color:var(--ink-0)">{l}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Direita — preferências -->
				<div style="display:flex;flex-direction:column;gap:16px">
					<div class="card" style="padding:24px">
						<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:16px">Preferências</div>

						<div class="eyebrow" style="margin-bottom:8px">Objetivos</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">
							{#if goalsList.length === 0}
								<span style="font:var(--body-sm);color:var(--ink-2)">Sem objetivos definidos</span>
							{/if}
							{#each goalsList as g (g)}
								<Chip variant="active">◆ {GOAL_LABELS[g] ?? g}</Chip>
							{/each}
						</div>

						<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
							<div>
								<div class="eyebrow" style="margin-bottom:6px">Sessão</div>
								<div class="num" style="font:var(--num-md);color:var(--ink-0)">{prefs?.minutesPerSession ?? '—'}</div>
								<div style="font:var(--label-mono);color:var(--ink-2)">minutos</div>
							</div>
							<div>
								<div class="eyebrow" style="margin-bottom:6px">Frequência</div>
								<div class="num" style="font:var(--num-md);color:var(--ink-0)">{prefs?.weeklySessions ?? '—'}</div>
								<div style="font:var(--label-mono);color:var(--ink-2)">por semana</div>
							</div>
						</div>

						{#if prefs?.experienceLevel}
							<div style="margin-top:20px">
								<div class="eyebrow" style="margin-bottom:6px">Nível</div>
								<Chip>{prefs.experienceLevel}</Chip>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if tab === 'plan'}
			<div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
					<div class="eyebrow">{plans.length} {plans.length === 1 ? 'plano' : 'planos'} · {plans.filter((p) => p.isActive).length} ativos</div>
					<Button onclick={() => goto(`/alunos/${student.id}/gerar`)}>+ Gerar novo plano</Button>
				</div>
				{#if plans.length === 0}
					<div class="card" style="padding:48px;text-align:center">
						<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:8px">Nenhum plano ainda</div>
						<div style="font:var(--body);color:var(--ink-2);margin-bottom:20px">Gere o primeiro plano baseado nas preferências e perfil clínico.</div>
						<Button onclick={() => goto(`/alunos/${student.id}/gerar`)}>+ Gerar plano</Button>
					</div>
				{:else}
					<div style="display:flex;flex-direction:column;gap:12px">
						{#each plans as p (p.id)}
							{@const chip = planChip(p)}
							<button
								type="button"
								onclick={() => goto(`/planos/${p.id}`)}
								class="card"
								style="all:unset;cursor:pointer;display:block;padding:22px;border:1px solid {p.isActive
									? 'var(--accent-dim)'
									: 'var(--ink-line)'};background:{p.isActive
									? 'linear-gradient(180deg, var(--accent-wash) 0%, var(--bg-2) 100%)'
									: 'var(--bg-2)'};border-radius:var(--r-3)"
							>
								<div
									style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:flex-start"
								>
									<div>
										<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
											<Chip variant={chip.variant}>{chip.label}</Chip>
											<span style="font:var(--label-mono);color:var(--ink-2)">{p.sessionsTotal} {p.sessionsTotal === 1 ? 'sessão' : 'sessões'}</span>
										</div>
										<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:6px;line-height:1.4">{p.title}</div>
										<div style="font:var(--body-sm);color:var(--ink-2)">
											Gerado {new Date(p.createdAt).toLocaleDateString('pt-BR')}
										</div>
									</div>
									<span style="color:var(--ink-2);font-size:22px">›</span>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div style="display:flex;flex-direction:column;gap:16px">
				<!-- Histórico de treino — o dado que o aluno registra, agora visível.
				     PSE colorido + observações ("joelho doeu") em destaque. -->
				{#if recentSessions.length > 0}
					<div class="card" style="padding:24px">
						<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
							<div>
								<Eyebrow>◆ Histórico de treino</Eyebrow>
								<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-top:4px">
									Últimas {recentSessions.length} {recentSessions.length === 1 ? 'sessão registrada' : 'sessões registradas'}
								</div>
							</div>
						</div>
						<div class="sess-list">
							{#each recentSessions as s (s.id)}
								<div class="sess-row">
									<div class="sess-pse" style="color:{pseColor(s.perceivedEffort)};border-color:{pseColor(s.perceivedEffort)}">
										<span class="num" style="font:600 15px var(--font-mono)">{s.perceivedEffort ?? '—'}</span>
										<span style="font:500 8px var(--font-mono);letter-spacing:0.06em">PSE</span>
									</div>
									<div class="sess-info">
										<div class="sess-top">
											<span style="font:500 14px var(--font-sans);color:var(--ink-0)">{s.label ?? 'Sessão'}</span>
											<span class="num" style="font:var(--label-mono);color:var(--ink-3)">{fmtSessionDate(s.date)}</span>
										</div>
										<div class="sess-meta">
											{s.doneCount}/{s.totalCount} exercícios{#if s.durationMinutes} · {s.durationMinutes} min{/if}
										</div>
										{#if s.observations}
											<div class="sess-obs">“{s.observations}”</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if detail.assessments.length === 0 && lastWeights.length === 0}
					<div class="card" style="padding:48px;text-align:center">
						<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-bottom:8px">Sem dados de avaliação física</div>
						<div style="font:var(--body);color:var(--ink-2);margin-bottom:20px">Registre uma avaliação física pra acompanhar peso, IMC, etc.</div>
						<Button onclick={() => goto(`/alunos/${student.id}/avaliacao`)}>+ Nova avaliação</Button>
					</div>
				{:else}
					<!-- Progresso com sparklines — 5 métricas -->
					{@const progress = detail.progress}
					{@const metrics = [
						{ key: 'weight', label: 'Peso', unit: 'kg', metric: progress.weight, color: 'var(--accent)' },
						{ key: 'bmi', label: 'IMC', unit: '', metric: progress.bmi, color: 'var(--info)' },
						{ key: 'bodyFat', label: 'Gordura', unit: '%', metric: progress.bodyFat, color: 'var(--warn)' },
						{ key: 'restingHr', label: 'FC repouso', unit: 'bpm', metric: progress.restingHr, color: 'var(--danger)' },
						{ key: 'bpSystolic', label: 'PA sistólica', unit: 'mmHg', metric: progress.bpSystolic, color: 'var(--accent-2)' }
					].filter(m => m.metric.values.length > 0)}

					{#if metrics.length > 0}
						<div class="card" style="padding:24px;margin-bottom:16px">
							<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
								<div>
									<Eyebrow>◆ Evolução clínica</Eyebrow>
									<div style="font:500 16px var(--font-sans);color:var(--ink-0);margin-top:4px">
										Últimas {metrics[0]?.metric.values.length} avaliações
									</div>
								</div>
							</div>
							<div class="progress-grid">
								{#each metrics as m (m.key)}
									{@const delta = m.metric.deltaPct}
									{@const positive = delta != null && delta >= 0}
									{@const goodDirection =
										m.key === 'weight' || m.key === 'bmi' || m.key === 'bodyFat' || m.key === 'bpSystolic' || m.key === 'restingHr'
											? !positive
											: positive}
									<div class="progress-card">
										<div class="progress-card__head">
											<span style="font:var(--label-mono);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em">{m.label}</span>
											{#if delta != null && Math.abs(delta) > 0.5}
												<span class="progress-delta" style="color:{goodDirection ? 'var(--success)' : 'var(--danger)'};background:{goodDirection ? 'var(--success-dim)' : 'var(--danger-dim)'}">
													{positive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
												</span>
											{/if}
										</div>
										<div style="display:flex;align-items:baseline;gap:4px;margin-top:8px">
											<span class="num" style="font:600 24px var(--font-mono);color:var(--ink-0)">{m.metric.current?.toFixed(1)}</span>
											{#if m.unit}<span style="font:500 12px var(--font-mono);color:var(--ink-3)">{m.unit}</span>{/if}
										</div>
										{#if m.metric.values.length > 1}
											<div style="margin-top:10px">
												<Sparkline data={m.metric.values} width={180} height={28} color={m.color} />
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="card" style="padding:24px">
						<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
							<div style="font:500 16px var(--font-sans);color:var(--ink-0)">Avaliações recentes</div>
							<Button variant="secondary" size="sm" onclick={() => goto(`/alunos/${student.id}/avaliacao`)}>+ Nova avaliação</Button>
						</div>
						{#each detail.assessments as a, i (a.id)}
							<div
								style="display:grid;grid-template-columns:1fr 140px 1fr 20px;gap:16px;align-items:center;padding:14px 0;{i
									? 'border-top:1px solid var(--ink-line)'
									: ''}"
							>
								<span style="font:500 14px var(--font-sans);color:var(--ink-0)">
									{a.bodyFatPct != null ? 'Bioimpedância' : 'Antropometria'}
								</span>
								<span class="num" style="font:var(--label-mono);color:var(--ink-2)">{new Date(a.assessedAt).toLocaleDateString('pt-BR')}</span>
								<span style="font:var(--body-sm);color:var(--ink-1)">{a.notes ?? '—'}</span>
								<span style="color:var(--ink-2)">›</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- ────── Modal: link do aluno (copiar / abrir / whatsapp / email) ────── -->
{#if showLinkModal}
	<div
		class="link-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="link-modal-title"
		onclick={(e) => { if (e.target === e.currentTarget) showLinkModal = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') showLinkModal = false; }}
	>
		<div class="link-card">
			<div class="eyebrow" style="margin-bottom:6px">◆ Magic-link</div>
			<h3 id="link-modal-title" class="link-title">
				Link do app do <span class="link-title-em">{student.name.split(' ')[0]}</span>
			</h3>
			<p class="link-prose">
				O aluno acessa direto pelo celular — sem login, sem app store. O link
				é único e validado por HMAC; só funciona com o token correto.
			</p>

			<label for="link-url" class="link-url-label">URL pra compartilhar</label>
			<input
				id="link-url"
				class="link-url-input"
				value={alunoUrl}
				readonly
				onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
			/>

			<div class="link-actions">
				<button type="button" class="link-action primary" onclick={copyLinkToClipboard}>
					<span>📋</span> Copiar
				</button>
				<a class="link-action" href={alunoUrl} target="_blank" rel="noopener">
					<span>↗</span> Abrir em nova aba
				</a>
				<a class="link-action whatsapp" href={whatsappUrl} target="_blank" rel="noopener">
					<span>◉</span> WhatsApp{student.phone ? ` (${student.phone})` : ''}
				</a>
				{#if mailtoUrl}
					<a class="link-action" href={mailtoUrl}>
						<span>✉</span> E-mail ({student.email})
					</a>
				{/if}
				{#if student.email}
					<!-- Reenvio server-side via Resend — não depende de client de email no desktop -->
					<form
						method="POST"
						action="?/resendMagicLink"
						style="display:contents"
						use:enhance={() => {
							resending = true;
							return async ({ result, update }) => {
								resending = false;
								if (result.type === 'error') {
									toast.error('Falha ao reenviar. Tente de novo.');
									return;
								}
								if (result.type === 'success') {
									toast.success(`Link reenviado pra ${(result.data as { sentTo?: string })?.sentTo ?? student.email}`);
								} else if (result.type === 'failure') {
									toast.error(String((result.data as { error?: string })?.error ?? 'Falha ao reenviar.'));
								}
								await update({ reset: false });
							};
						}}
					>
						<button type="submit" class="link-action" disabled={resending}>
							<span>✉</span> {resending ? 'Enviando…' : 'Reenviar por e-mail'}
						</button>
					</form>
				{/if}
			</div>

			<button type="button" class="link-close" onclick={() => (showLinkModal = false)}>
				Fechar
			</button>
		</div>
	</div>
{/if}

<style>
	/* Card de destaque da evolução de carga — topo da ficha, sempre visível */
	.load-hero {
		padding: 20px 32px 0;
	}
	.load-hero-card {
		padding: 22px 24px !important;
		border: 1px solid var(--accent-dim) !important;
		background: linear-gradient(180deg, var(--accent-wash) 0%, var(--bg-2) 42%) !important;
	}
	.load-hero-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 16px;
	}
	.load-hero-hint {
		font: var(--label-mono);
		color: var(--ink-3);
		text-align: right;
		max-width: 240px;
		line-height: 1.4;
	}
	.load-hero-empty {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px !important;
	}
	@media (max-width: 1023px) {
		.load-hero {
			padding: 14px 14px 0;
		}
		.load-hero-card {
			padding: 16px !important;
		}
		.load-hero-head {
			flex-direction: column;
			gap: 6px;
		}
		.load-hero-hint {
			text-align: left;
			max-width: none;
		}
	}

	.link-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(8, 8, 12, 0.78);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		z-index: 200;
		animation: link-fade 180ms ease-out;
	}
	.link-card {
		width: 100%;
		max-width: 520px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-3);
		padding: 26px 28px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
	}
	.link-title {
		margin: 6px 0 0;
		font: 500 22px var(--font-sans);
		letter-spacing: -0.01em;
		color: var(--ink-0);
	}
	.link-title-em {
		color: var(--accent);
	}
	.link-prose {
		margin: 10px 0 18px;
		font: 400 13px var(--font-sans);
		line-height: 1.55;
		color: var(--ink-2);
	}
	.link-url-label {
		display: block;
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 6px;
	}
	.link-url-input {
		width: 100%;
		padding: 11px 12px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 400 12px var(--font-mono);
		color: var(--ink-0);
		box-sizing: border-box;
		outline: none;
	}
	.link-url-input:focus {
		border-color: var(--accent);
	}
	.link-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 16px 0 14px;
	}
	.link-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 42px;
		padding: 0 12px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 500 13px var(--font-sans);
		text-decoration: none;
		cursor: pointer;
		transition: background 120ms;
	}
	.link-action:hover {
		background: var(--bg-3);
	}
	.link-action.primary {
		background: var(--accent);
		color: #0a0a0a;
		border-color: var(--accent);
	}
	.link-action.primary:hover {
		filter: brightness(1.08);
	}
	.link-action.whatsapp {
		background: rgba(37, 211, 102, 0.12);
		border-color: rgba(37, 211, 102, 0.35);
		color: rgb(120, 230, 160);
	}
	.link-action.whatsapp:hover {
		background: rgba(37, 211, 102, 0.18);
	}
	.link-close {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 10px;
		background: transparent;
		border: 1px solid transparent;
		color: var(--ink-3);
		font: 500 12px var(--font-sans);
		cursor: pointer;
		border-radius: var(--r-2);
	}
	.link-close:hover {
		color: var(--ink-0);
	}
	@keyframes link-fade {
		from { opacity: 0; transform: scale(0.97); }
		to { opacity: 1; transform: scale(1); }
	}

	.progress-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 14px;
	}
	.progress-card {
		padding: 14px 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
	}
	.progress-card__head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.progress-delta {
		font: 500 10px var(--font-mono);
		padding: 2px 6px;
		border-radius: var(--r-pill);
	}
	@media (max-width: 768px) {
		.progress-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	/* ─────── Histórico de treino (timeline) ─────── */
	.sess-list {
		display: flex;
		flex-direction: column;
	}
	.sess-row {
		display: flex;
		gap: 14px;
		padding: 14px 0;
		border-top: 1px solid var(--ink-line);
	}
	.sess-row:first-child {
		border-top: 0;
	}
	.sess-pse {
		flex-shrink: 0;
		width: 46px;
		height: 46px;
		border-radius: var(--r-2);
		border: 1px solid;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: var(--bg-2);
	}
	.sess-info {
		flex: 1;
		min-width: 0;
	}
	.sess-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.sess-meta {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 3px;
	}
	.sess-obs {
		margin-top: 8px;
		padding: 8px 12px;
		background: var(--bg-2);
		border-left: 2px solid var(--warn);
		border-radius: var(--r-1);
		font: 400 13px/1.5 var(--font-sans);
		color: var(--ink-1);
		font-style: italic;
	}
</style>
