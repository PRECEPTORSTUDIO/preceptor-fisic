<script lang="ts">
	import { Avatar, Chip, Sparkline, Eyebrow, ThemeToggle, toast } from '$lib/components/ui';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const student = $derived(data.student);
	const pro = $derived(data.professional);
	const plan = $derived(data.plan);
	const sessions = $derived(plan?.planData.weekly_sessions ?? []);
	const streak = $derived(data.streakDays);
	const recent = $derived(data.recentSessions);

	// Restrições clínicas do plano (vermelhas/amarelas/verdes) — mostradas
	// no card "Atenção clínica" pro aluno saber o que evitar / monitorar.
	type PlanRestriction = { level?: 'red' | 'yellow' | 'green'; title?: string; description?: string };
	const restrictions = $derived(
		((plan?.planData.restrictions ?? []) as PlanRestriction[]).filter(
			(r) => r.title && r.level !== 'green' // green = "aprovado", sem necessidade de alerta
		)
	);

	// Preserva o magic-link token na navegação interna
	const tokenParam = $derived(page.url.searchParams.get('t'));
	const tq = $derived(tokenParam ? `?t=${tokenParam}` : '');

	// Onboarding overlay — só na primeira visita do aluno
	let showOnboarding = $state(false);
	let onboardingStep = $state(0);
	const ONBOARDING_KEY = $derived(`pf_aluno_onb_${student.id}`);

	const onboardingSteps = [
		{
			title: `Olá, ${student.name.split(' ')[0]}`,
			body: `${pro.name} cadastrou você no PreceptorFISIC. Esse é seu app pessoal pra acompanhar treinos prescritos por ele.`,
			icon: '◆'
		},
		{
			title: 'Aqui é seu treino do dia',
			body: 'Toque no card "Treino de hoje" pra ver os exercícios. Ao terminar cada série, marca o peso usado e como foi a percepção (PSE).',
			icon: '◐'
		},
		{
			title: 'Sua aderência aparece em tempo real',
			body: 'Streak (dias consecutivos) e histórico ficam salvos. Seu treinador vê o progresso e ajusta o plano com base nisso.',
			icon: '⊕'
		}
	];

	function nextOnboarding() {
		if (onboardingStep < onboardingSteps.length - 1) {
			onboardingStep++;
		} else {
			dismissOnboarding();
		}
	}
	function dismissOnboarding() {
		try {
			localStorage.setItem(ONBOARDING_KEY, '1');
		} catch {
			/* localStorage pode estar desabilitado, sem stress */
		}
		showOnboarding = false;
	}

	onMount(() => {
		if (page.url.searchParams.get('just_completed') === '1') {
			toast.success('Treino registrado · 🔥 streak +1');
			const u = new URL(page.url);
			u.searchParams.delete('just_completed');
			replaceState(u, page.state);
		}
		// Primeira visita? Mostra onboarding
		try {
			if (!localStorage.getItem(ONBOARDING_KEY)) showOnboarding = true;
		} catch {
			/* localStorage desabilitado: não mostra */
		}
	});

	const today = new Date();
	const weekday = today.toLocaleDateString('pt-BR', { weekday: 'long' });
	const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

	// getDay() → chave day_of_week do plano (0=dom … 6=sab).
	const DOW_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
	const DOW_LABELS: Record<string, string> = {
		dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta',
		qui: 'quinta', sex: 'sexta', sab: 'sábado'
	};
	const hasDow = $derived(sessions.some((s) => s.day_of_week));

	const todaySessionIdx = $derived.by(() => {
		if (sessions.length === 0) return -1;
		// Grade real do plano: sessão marcada pro dia de hoje (-1 = descanso).
		if (hasDow) return sessions.findIndex((s) => s.day_of_week === DOW_KEYS[today.getDay()]!);
		// Fallback (planos antigos sem day_of_week): rotação pelo dia da semana.
		return today.getDay() % sessions.length;
	});
	const todaySession = $derived(todaySessionIdx >= 0 ? sessions[todaySessionIdx] : null);

	// Dia de descanso (grade com day_of_week, nada hoje): acha o próximo
	// treino a partir de amanhã pra mostrar no card no lugar do "hoje".
	const nextSessionIdx = $derived.by(() => {
		if (!hasDow || todaySessionIdx >= 0) return -1;
		for (let k = 1; k <= 7; k++) {
			const key = DOW_KEYS[(today.getDay() + k) % 7]!;
			const i = sessions.findIndex((s) => s.day_of_week === key);
			if (i >= 0) return i;
		}
		return -1;
	});
	const nextSession = $derived(nextSessionIdx >= 0 ? sessions[nextSessionIdx] : null);
	const exerciseCount = $derived(todaySession ? (todaySession.main?.length ?? 0) : 0);

	// Thumbnails dos primeiros exercícios da sessão de hoje — só os que
	// têm catalog_id e vídeo resolvido no load. Limita a 6 pra não pesar.
	const videoByCatalogId = $derived(
		(data.videoByCatalogId ?? {}) as Record<string, string>
	);
	const todayThumbnails = $derived(
		todaySession
			? ((todaySession.main ?? []) as Array<{ name: string; catalog_id?: string }>)
					.map((ex) => ({ name: ex.name, src: ex.catalog_id ? videoByCatalogId[ex.catalog_id] : undefined }))
					.filter((t): t is { name: string; src: string } => Boolean(t.src))
					.slice(0, 6)
			: []
	);

	// "Esta semana": usa contagem real da semana corrente (não as últimas 10
	// sessões). weeklyTarget vem das preferências do plano quando disponível.
	const weeklyTarget = $derived(data.weeklyTarget ?? 3);
	const sessionsThisWeek = $derived(data.sessionsThisWeek ?? 0);
	const recentDone = $derived(Math.min(sessionsThisWeek, weeklyTarget));
</script>

<svelte:head>
	<title>{student.name} · PreceptorFISIC</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div class="page">
	<!-- Header -->
	<header class="header">
		<div class="header-glow"></div>
		<div style="display:flex;justify-content:space-between;align-items:center;position:relative">
			<div>
				<div class="eyebrow" style="text-transform:uppercase">{weekday} · {dateStr}</div>
				<div style="font:500 22px var(--font-sans);margin-top:4px;letter-spacing:-0.02em">
					Olá, {student.name.split(' ')[0]}
				</div>
			</div>
			<div style="display:flex;align-items:center;gap:10px">
				<ThemeToggle />
				<Avatar name={student.name} size={40} />
			</div>
		</div>
	</header>

	{#if !plan}
		<div class="empty">
			<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:6px">
				Sem plano ativo ainda
			</div>
			<div style="font:var(--body);color:var(--ink-2)">
				Seu treinador <span style="color:var(--ink-1)">{pro.name}</span> ainda não publicou um plano.
			</div>
		</div>
	{:else}
		<!-- Treino do dia · card hero -->
		{#if todaySession}
			<div class="hero-card-wrap">
				<div class="hero-card">
					<div class="eyebrow" style="margin-bottom:8px;color:var(--accent-2)">● Treino de hoje</div>
					<div style="font:500 24px var(--font-sans);letter-spacing:-0.02em;margin-bottom:4px">
						{todaySession.label ?? 'Sessão'}
					</div>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-bottom:18px">
						{todaySession.focus ?? '—'}
					</div>

					<div style="display:flex;gap:16px;margin-bottom:18px">
						{#each [['Exercícios', String(exerciseCount)], ['Tempo est.', `${todaySession.duration_minutes ?? '—'}m`], ['Restrições', String((plan.planData.restrictions ?? []).length)]] as [l, v] (l)}
							<div style="flex:1">
								<div class="eyebrow" style="margin-bottom:4px">{l}</div>
								<div class="num" style="font:500 20px var(--font-mono);color:var(--ink-0)">{v}</div>
							</div>
						{/each}
					</div>

					{#if todayThumbnails.length > 0}
						<div class="thumb-strip" aria-label="Prévia dos exercícios">
							{#each todayThumbnails as t (t.src)}
								<div class="thumb-card" title={t.name}>
									<img
										src={t.src}
										alt={t.name}
										loading="lazy"
										class="thumb-vid"
									/>
									<div class="thumb-label">{t.name}</div>
								</div>
							{/each}
						</div>
					{/if}

					<button class="cta" onclick={() => goto(`/a/${student.id}/treino/${todaySessionIdx}${tq}`)}>
						Iniciar treino →
					</button>
				</div>
			</div>
		{:else if nextSession}
			<!-- Dia de descanso — grade day_of_week sem sessão hoje -->
			<div class="hero-card-wrap">
				<div class="hero-card">
					<div class="eyebrow" style="margin-bottom:8px">○ Hoje é descanso</div>
					<div style="font:500 24px var(--font-sans);letter-spacing:-0.02em;margin-bottom:4px">
						Sem treino hoje
					</div>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-bottom:18px">
						Próximo treino: {nextSession.label ?? 'Sessão'}{nextSession.day_of_week ? ` · ${DOW_LABELS[nextSession.day_of_week]}` : ''}
					</div>
					<button class="cta" onclick={() => goto(`/a/${student.id}/treino/${nextSessionIdx}${tq}`)}>
						Ver próximo treino →
					</button>
				</div>
			</div>
		{/if}

		<!-- Atenção clínica — restrições do plano (red/yellow) -->
		{#if restrictions.length > 0}
			<div class="restr-card">
				<div class="restr-head">
					<span class="restr-head-icon">⚠</span>
					<div>
						<div class="eyebrow" style="margin-bottom:2px">Atenção clínica</div>
						<div style="font:500 15px var(--font-sans);color:var(--ink-0)">
							{restrictions.length} ponto{restrictions.length === 1 ? '' : 's'} de atenção
						</div>
					</div>
				</div>
				<div class="restr-list">
					{#each restrictions as r, i (i)}
						<div class="restr-item" class:red={r.level === 'red'} class:yellow={r.level === 'yellow'}>
							<div class="restr-item-mark">
								{r.level === 'red' ? '●' : '○'}
							</div>
							<div style="flex:1;min-width:0">
								<div style="font:500 13px var(--font-sans);color:var(--ink-0);margin-bottom:2px">{r.title}</div>
								{#if r.description}
									<div style="font:400 12px var(--font-sans);line-height:1.5;color:var(--ink-2)">{r.description}</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				<div class="restr-foot">
					Prescrito por <strong>{pro.name}</strong> — em caso de dúvida, fale com seu treinador antes de treinar.
				</div>
			</div>
		{/if}

		<!-- Streak + frequência -->
		<div class="stats-row">
			<div class="card mini">
				<div class="eyebrow" style="margin-bottom:8px">🔥 Sequência</div>
				<div style="display:flex;align-items:baseline;gap:4px">
					<span class="num" style="font:500 32px var(--font-mono);color:var(--accent)">{streak}</span>
					<span style="font:var(--label-mono);color:var(--ink-2)">{streak === 1 ? 'dia' : 'dias'}</span>
				</div>
			</div>
			<div class="card mini">
				<div class="eyebrow" style="margin-bottom:8px">Esta semana</div>
				<div style="display:flex;align-items:baseline;gap:4px">
					<span class="num" style="font:500 32px var(--font-mono);color:var(--ink-0)">{recentDone}/{weeklyTarget}</span>
					<span style="font:var(--label-mono);color:var(--ink-2)">treinos</span>
				</div>
			</div>
		</div>

		<!-- Plano completo -->
		<div class="section" id="plano">
			<div class="section-header">
				<Eyebrow>Plano completo</Eyebrow>
				<a href="/a/{student.id}/historico{tq}" style="font:var(--label-mono);color:var(--accent);text-decoration:none">
					HISTÓRICO →
				</a>
			</div>
			<div class="sessions-list">
				{#each sessions as s, i (i)}
					{@const isToday = i === todaySessionIdx}
					<button
						class="session-card"
						class:today={isToday}
						onclick={() => goto(`/a/${student.id}/treino/${i}${tq}`)}
					>
						<div class="session-letter" class:today={isToday}>{String.fromCharCode(65 + i)}</div>
						<div style="flex:1;min-width:0;text-align:left">
							<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
								<span style="font:500 16px var(--font-sans);color:var(--ink-0)">{s.label ?? `Treino ${String.fromCharCode(65 + i)}`}</span>
								{#if s.day_of_week}<span style="font:var(--label-mono);color:var(--ink-3);text-transform:uppercase">{s.day_of_week}</span>{/if}
								{#if isToday}<Chip variant="active">● hoje</Chip>{/if}
							</div>
							<div style="font:var(--body-sm);color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
								{s.focus ?? `${s.main?.length ?? 0} exercícios · ${s.duration_minutes ?? '—'} min`}
							</div>
						</div>
						<span class="num" style="font:var(--label-mono);color:var(--ink-2)">{s.main?.length ?? 0} ex</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Mensagem do treinador -->
		<div class="section">
			<div class="card msg-card">
				<Avatar name={pro.name} size={36} />
				<div style="flex:1">
					<div style="display:flex;justify-content:space-between;margin-bottom:4px">
						<span style="font:500 13px var(--font-sans);color:var(--ink-0)">{pro.name}</span>
						<span style="font:var(--label-mono);color:var(--ink-3)">treinador{pro.cref ? ' · ' + pro.cref : ''}</span>
					</div>
					<div style="font:var(--body-sm);color:var(--ink-1);line-height:1.5">
						Plano em vigor. Treine no seu ritmo, prestando atenção às restrições e ao monitoramento que combinamos.
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- LGPD: canal de direitos do titular (art. 18) — acesso, correção, exclusão -->
	<div class="lgpd-foot">
		Seus dados são tratados conforme a
		<a href="/legal/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.
		Pra corrigir ou excluir seus dados, fale com seu treinador ou escreva pra
		<a href="mailto:castroomath7@gmail.com">castroomath7@gmail.com</a>.
	</div>

	<!-- Bottom tab bar -->
	<nav class="tab-bar">
		{#each [{ id: 'hoje', icon: '◉', label: 'Hoje', href: `/a/${student.id}${tq}` }, { id: 'plano', icon: '▤', label: 'Plano', href: `/a/${student.id}${tq}#plano` }, { id: 'mensagens', icon: '✉', label: 'Mensagens', href: `/a/${student.id}/mensagens${tq}` }, { id: 'historico', icon: '◔', label: 'Histórico', href: `/a/${student.id}/historico${tq}` }] as t (t.id)}
			<a href={t.href} class="tab-link" class:on={t.id === 'hoje'}>
				<span style="position:relative;font-size:20px">
					{t.icon}
					{#if t.id === 'mensagens' && (data.unreadMessages ?? 0) > 0}
						<span class="tab-badge">{data.unreadMessages}</span>
					{/if}
				</span>
				<span style="font:500 10px var(--font-sans)">{t.label}</span>
			</a>
		{/each}
	</nav>

	<!-- Onboarding overlay (primeira visita do aluno) -->
	{#if showOnboarding}
		<div
			class="onb-backdrop"
			onclick={dismissOnboarding}
			onkeydown={(e) => e.key === 'Escape' && dismissOnboarding()}
			role="presentation"
			tabindex="-1"
		></div>
		<div class="onb-card" role="dialog" aria-modal="true" aria-label="Bem-vindo ao app">
			<div class="onb-progress">
				{#each onboardingSteps as _, i (i)}
					<div class="onb-dot" class:on={i === onboardingStep}></div>
				{/each}
			</div>
			{#if onboardingSteps[onboardingStep]}
				{@const step = onboardingSteps[onboardingStep]!}
				<div class="onb-icon">{step.icon}</div>
				<h2 class="onb-title">{step.title}</h2>
				<p class="onb-body">{step.body}</p>
			{/if}
			<div class="onb-actions">
				<button type="button" class="onb-skip" onclick={dismissOnboarding}>Pular</button>
				<button type="button" class="onb-next" onclick={nextOnboarding}>
					{onboardingStep < onboardingSteps.length - 1 ? 'Continuar' : 'Começar →'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-bottom: 92px;
	}
	.header {
		padding: 18px 20px 14px;
		position: relative;
		overflow: hidden;
	}
	.sessions-list {
		display: flex;
		flex-direction: column;
	}
	.header-glow {
		position: absolute;
		top: -80px;
		right: -40px;
		width: 200px;
		height: 200px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
		pointer-events: none;
	}
	.empty {
		text-align: center;
		padding: 40px 24px;
	}
	.hero-card-wrap {
		padding: 8px 16px 18px;
	}
	.hero-card {
		position: relative;
		background: linear-gradient(180deg, var(--accent-wash) 0%, var(--bg-2) 100%);
		border: 1px solid var(--accent-dim);
		border-radius: var(--r-3);
		padding: 22px 20px;
		box-shadow: var(--glow-accent);
	}
	.cta {
		width: 100%;
		height: 50px;
		background: var(--accent);
		color: var(--on-accent);
		border: 0;
		border-radius: var(--r-2);
		cursor: pointer;
		font: 500 16px var(--font-sans);
		letter-spacing: -0.01em;
		box-shadow: 0 8px 24px rgba(167, 139, 250, 0.3);
	}
	/* Card "Atenção clínica" — restrições do plano que o aluno precisa ver */
	.restr-card {
		margin: 0 16px 16px;
		padding: 16px 18px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-left: 3px solid var(--warn);
		border-radius: var(--r-2);
	}
	.restr-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}
	.restr-head-icon {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--warn-dim);
		color: var(--warn);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 16px var(--font-sans);
		flex-shrink: 0;
	}
	.restr-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.restr-item {
		display: flex;
		gap: 10px;
		padding: 10px 12px;
		background: var(--bg-2);
		border-radius: var(--r-1);
	}
	.restr-item.red { border-left: 2px solid var(--danger); }
	.restr-item.yellow { border-left: 2px solid var(--warn); }
	.restr-item-mark {
		font: 600 12px var(--font-sans);
		color: var(--ink-2);
		width: 14px;
		flex-shrink: 0;
		text-align: center;
	}
	.restr-item.red .restr-item-mark { color: var(--danger); }
	.restr-item.yellow .restr-item-mark { color: var(--warn); }
	.restr-foot {
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px dashed var(--ink-line-2);
		font: 400 11px var(--font-sans);
		line-height: 1.5;
		color: var(--ink-3);
	}

	.thumb-strip {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		padding: 4px 4px 16px;
		margin: 0 -4px 14px;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.thumb-strip::-webkit-scrollbar { display: none; }
	.thumb-card {
		flex: 0 0 96px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.thumb-vid {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: var(--r-2);
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
	}
	.thumb-label {
		font: 400 11px var(--font-sans);
		color: var(--ink-2);
		line-height: 1.2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stats-row {
		padding: 0 16px 16px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.card.mini {
		padding: 16px;
	}
	.section {
		padding: 8px 16px 16px;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.session-card {
		all: unset;
		cursor: pointer;
		display: grid;
		grid-template-columns: 44px 1fr auto;
		gap: 14px;
		align-items: center;
		padding: 14px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		margin-bottom: 8px;
		transition: background 140ms var(--ease);
	}
	.session-card.today {
		background: linear-gradient(180deg, var(--accent-wash) 0%, var(--bg-2) 100%);
		border-color: var(--accent-dim);
	}
	.session-letter {
		width: 44px;
		height: 44px;
		border-radius: var(--r-2);
		background: var(--bg-3);
		color: var(--ink-1);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 500 18px var(--font-sans);
	}
	.session-letter.today {
		background: var(--accent);
		color: var(--on-accent);
	}
	.msg-card {
		display: flex;
		gap: 12px;
		padding: 16px;
	}
	.lgpd-foot {
		margin: 4px 16px 96px;
		padding: 12px 14px;
		font: 400 11px/1.6 var(--font-sans);
		color: var(--ink-3);
		text-align: center;
	}
	.lgpd-foot a {
		color: var(--ink-2);
	}
	.tab-bar {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 480px;
		/* Token, não valor fixo: no claro isso vira rgba(255,255,255,0.92).
		   Cravado em rgba(10,10,10,.92), o app do aluno ficava todo branco
		   com uma barra preta colada no rodapé. */
		background: var(--bg-glass-strong);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid var(--ink-line);
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		padding: 10px 0 max(env(safe-area-inset-bottom, 12px), 12px);
		z-index: 50;
	}
	.tab-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px 4px;
		color: var(--ink-3);
		text-decoration: none;
	}
	.tab-link.on {
		color: var(--accent);
	}
	.tab-badge {
		position: absolute;
		top: -6px;
		right: -10px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		box-sizing: border-box;
		border-radius: var(--r-pill);
		background: var(--accent);
		color: #0a0a0a;
		font: 600 10px var(--font-mono);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	/* Onboarding overlay */
	.onb-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 90;
		animation: onb-fade 200ms var(--ease);
	}
	.onb-card {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		z-index: 100;
		width: calc(100% - 32px);
		max-width: 380px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 28px 24px;
		box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
		animation: onb-slide 280ms var(--ease);
		text-align: center;
	}
	@keyframes onb-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes onb-slide {
		from {
			transform: translate(-50%, 24px);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}
	.onb-progress {
		display: flex;
		gap: 6px;
		justify-content: center;
		margin-bottom: 20px;
	}
	.onb-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink-line-2);
		transition: all 200ms var(--ease);
	}
	.onb-dot.on {
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
		width: 18px;
		border-radius: 3px;
	}
	.onb-icon {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent-wash);
		border: 1px solid var(--accent);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 22px var(--font-sans);
		margin: 0 auto 16px;
		box-shadow: var(--glow-accent);
	}
	.onb-title {
		font: 500 22px var(--font-sans);
		letter-spacing: -0.018em;
		margin: 0 0 10px;
		color: var(--ink-0);
	}
	.onb-body {
		font: 400 14px/1.55 var(--font-sans);
		color: var(--ink-2);
		margin: 0 0 24px;
	}
	.onb-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
	}
	.onb-skip {
		all: unset;
		cursor: pointer;
		padding: 10px 18px;
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
	}
	.onb-skip:hover {
		color: var(--ink-0);
	}
	.onb-next {
		all: unset;
		cursor: pointer;
		padding: 12px 24px;
		background: linear-gradient(180deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		font: 600 14px var(--font-sans);
		border-radius: var(--r-pill);
		box-shadow: var(--glow-accent);
		transition: transform 140ms var(--ease);
	}
	.onb-next:hover {
		transform: translateY(-1px);
	}
</style>
