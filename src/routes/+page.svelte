<script lang="ts">
	import { onMount } from 'svelte';
	import { BrandMark } from '$lib/components/ui';

	let { data } = $props();

	// Dual video crossfade — elimina a travadinha do loop nativo.
	// Quando A está nos últimos 500ms, B inicia do zero e crossfade visual
	// suave (opacity transition). Quando B aproxima do fim, A reinicia
	// e crossfade reverso. Loop infinito sem rebuffer/jump.
	let videoA: HTMLVideoElement | undefined = $state();
	let videoB: HTMLVideoElement | undefined = $state();
	let activeVideo = $state<'A' | 'B'>('A');
	let scrolled = $state(false);

	const FADE_LEAD_S = 0.5; // crossfade começa este nº de segundos antes do fim

	onMount(() => {
		const onScroll = () => {
			scrolled = window.scrollY > 8;
		};
		window.addEventListener('scroll', onScroll, { passive: true });

		const a = videoA;
		const b = videoB;
		if (!a || !b) return;

		// Reduced-motion / Save-Data: não baixa vídeo nenhum. O CSS já esconde
		// o <video> no reduced-motion, mas display:none não impede o download —
		// por isso o gate fica aqui, antes de qualquer load()/play().
		const skipVideo =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData ===
				true;
		if (skipVideo) {
			return () => window.removeEventListener('scroll', onScroll);
		}

		// Inicia A. B fica pausado até precisar fazer crossfade.
		const tryPlay = (v: HTMLVideoElement) =>
			v.play().catch(() => {
				const unlock = () => {
					v.play().catch(() => {});
					document.removeEventListener('pointerdown', unlock);
				};
				document.addEventListener('pointerdown', unlock, { once: true });
			});
		// preload="none" no markup: o download de A só dispara aqui,
		// quando o JS decidiu tocar.
		a.load();
		tryPlay(a);

		// Lógica do crossfade: monitora timeupdate em ambos os videos.
		// Quando o ativo passa do limite, aciona o outro.
		const onTimeUpdate = (event: Event) => {
			const target = event.currentTarget as HTMLVideoElement;
			if (!target.duration || isNaN(target.duration)) return;
			const isA = target === a;
			const other = isA ? b : a;
			const remaining = target.duration - target.currentTime;

			// Warm-up de B: com preload="none" nada baixa até aqui. ~1s depois
			// de A começar a tocar, B inicia o download e chega bufferizado
			// ao crossfade de 0,5s.
			if (isA && other.preload === 'none' && target.currentTime > 1) {
				other.preload = 'auto';
				other.load();
			}

			// Está perto do fim?
			if (remaining <= FADE_LEAD_S && remaining > 0) {
				// O outro ainda tá pausado? Inicia ele.
				if (other.paused) {
					other.currentTime = 0;
					tryPlay(other);
					activeVideo = isA ? 'B' : 'A'; // CSS faz o fade
				}
			}
			// Acabou? Pausa pra ele esperar a próxima vez.
			if (target.ended || remaining < 0.05) {
				target.pause();
				target.currentTime = 0;
			}
		};

		a.addEventListener('timeupdate', onTimeUpdate);
		b.addEventListener('timeupdate', onTimeUpdate);
		// `ended` também dispara fim caso timeupdate perca o frame
		const onEnded = (event: Event) => {
			const t = event.currentTarget as HTMLVideoElement;
			t.pause();
			t.currentTime = 0;
		};
		a.addEventListener('ended', onEnded);
		b.addEventListener('ended', onEnded);

		return () => {
			window.removeEventListener('scroll', onScroll);
			a.removeEventListener('timeupdate', onTimeUpdate);
			b.removeEventListener('timeupdate', onTimeUpdate);
			a.removeEventListener('ended', onEnded);
			b.removeEventListener('ended', onEnded);
		};
	});

	const FEATURES = [
		{
			eyebrow: 'Ciência na geração',
			title: 'Geração com diretrizes',
			body: 'PreceptorFISIC consulta as diretrizes ACSM, AHA, OMS e ESSA na hora de gerar. Cada recomendação cita a fonte, com página e organização: nada é inventado.',
			metric: '2.040',
			metricLabel: 'trechos de diretrizes'
		},
		{
			eyebrow: 'Segurança clínica',
			title: 'Motor de regras clínicas',
			body: 'Cada plano passa por 23 regras clínicas (LCA, hipertensão, cardiopatia, gestação, DPOC...) que detectam contraindicações antes de você liberar para o aluno.',
			metric: '23',
			metricLabel: 'regras clínicas'
		}
	];

	const STEPS = [
		{
			n: '01',
			title: 'Cadastre o aluno',
			body: 'Histórico clínico, comorbidades, medicamentos, risco cardiovascular, preferências de treino. Tudo em uma tela densa de 2 minutos.'
		},
		{
			n: '02',
			title: 'Gere com PreceptorFISIC',
			body: 'Plano sai em 15-30s e você vê materializando ao vivo. ACSM tem prioridade nas fontes. Validação clínica automática antes de publicar.'
		},
		{
			n: '03',
			title: 'Aluno recebe magic-link',
			body: 'Link único pro celular dele. Treino do dia, registro de séries, histórico de aderência. Sem fricção, sem login.'
		}
	];

	const METRICS = [
		{ v: '15-30s', l: 'tempo de geração' },
		// Só métricas compriváveis — sem números de aderência/usuários fabricados
		// (mesma política do /login; risco CDC/CONFEF)
		{ v: '1.324', l: 'exercícios com vídeo' },
		{ v: 'ACSM ★', l: 'prioridade nas fontes' }
	];

	const PAINS = [
		{
			title: 'Medo de errar',
			body: 'Hipertenso, gestante, pós-cirúrgico: uma prescrição errada vira risco real. E a responsabilidade é sua, sozinho.'
		},
		{
			title: 'Tempo perdido',
			body: 'Horas pesquisando diretriz, montando planilha e conferindo contraindicação aluno por aluno. Tempo que não volta e não escala.'
		},
		{
			title: 'IA genérica não serve',
			body: 'ChatGPT e Gemini não citam fonte, não priorizam ACSM e inventam com confiança. Para populações especiais, isso é inaceitável.'
		}
	];

	/** Ciclo de cobrança escolhido na seção de preços. */
	let cycle = $state<'mensal' | 'anual'>('mensal');

	type Tier = {
		price: string;
		period: string;
		href: string;
		/** Valor cheio riscado (12 meses avulsos) — só no ciclo anual. */
		was?: string;
		/** Equivalência mensal do anual, ex: "equivale a R$ 58,25/mês". */
		equiv?: string;
		/** Texto alternativo quando o plano não tem anual de autoatendimento. */
		note?: string;
	};
	type Plan = {
		name: string;
		desc: string;
		items: string[];
		cta: string;
		featured: boolean;
		mensal: Tier;
		anual: Tier;
	};

	const PLANS: Plan[] = [
		{
			name: 'Essencial',
			desc: 'Para o profissional em crescimento.',
			items: ['Até 60 alunos ativos', 'Até 20 treinos gerados por IA/mês', 'Histórico completo de planos', 'Suporte por e-mail'],
			/* Cadastro grátis primeiro; a assinatura é feita em /assinatura dentro
			   do app (customer Asaas criado com o email da conta → match
			   determinístico no webhook). Links diretos do Asaas ficam pra venda
			   assistida (WhatsApp). */
			cta: 'Começar agora',
			featured: false,
			mensal: {
				price: 'R$ 69,90',
				period: '/mês',
				href: '/login?mode=signup&next=' + encodeURIComponent('/assinatura?plan=essencial_mensal')
			},
			anual: {
				price: 'R$ 699,00',
				period: '/ano',
				was: 'R$ 838,80',
				equiv: 'equivale a R$ 58,25/mês',
				href: '/login?mode=signup&next=' + encodeURIComponent('/assinatura?plan=essencial_anual')
			}
		},
		{
			name: 'Pro',
			desc: 'Para quem vive de prescrição clínica.',
			items: ['Até 150 alunos ativos', 'Até 50 treinos gerados por IA/mês', 'Auditoria completa de cada plano', 'Prioridade na geração'],
			cta: 'Começar agora',
			featured: true,
			mensal: {
				price: 'R$ 149,90',
				period: '/mês',
				href: '/login?mode=signup&next=' + encodeURIComponent('/assinatura?plan=pro_mensal')
			},
			anual: {
				price: 'R$ 1.498,80',
				period: '/ano',
				was: 'R$ 1.798,80',
				equiv: 'equivale a R$ 124,90/mês',
				href: '/login?mode=signup&next=' + encodeURIComponent('/assinatura?plan=pro_anual')
			}
		},
		{
			name: 'Institucional',
			desc: 'Para clínicas, academias e equipes.',
			items: ['Múltiplos profissionais', 'Até 100 treinos gerados por IA/mês', 'Onboarding dedicado', 'Contrato e faturamento'],
			cta: 'Falar com o time',
			featured: false,
			mensal: {
				price: 'R$ 499,90',
				period: 'a partir de · /mês',
				href: 'https://wa.me/553591481514?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20plano%20Institucional%20do%20PreceptorFISIC.'
			},
			/** Sem link de autoatendimento: anual do Institucional é negociado no WhatsApp. */
			anual: {
				price: 'R$ 499,90',
				period: 'a partir de · /mês',
				note: 'Anual sob consulta',
				href: 'https://wa.me/553591481514?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20plano%20Institucional%20anual%20do%20PreceptorFISIC.'
			}
		}
	];
</script>

<svelte:head>
	<title>PreceptorFISIC · Prescrição clínica validada</title>
	<meta
		name="description"
		content="Plataforma para profissionais CREF/CREFITO que prescrevem exercícios para populações especiais. PreceptorFISIC com diretrizes ACSM, validação clínica automática, app mobile do aluno."
	/>
	<meta name="keywords" content="prescrição exercício, populações especiais, hipertensão, diabetes, cardiopatia, ACSM, fisioterapia, personal trainer, CREF, CREFITO" />
	<meta name="author" content="PreceptorFISIC" />
	<link rel="canonical" href={`${data.origin}/`} />

	<!-- Open Graph (Facebook, LinkedIn, WhatsApp) -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${data.origin}/`} />
	<meta property="og:title" content="PreceptorFISIC · Prescrição clínica validada" />
	<meta
		property="og:description"
		content="PreceptorFISIC com diretrizes ACSM · Validação clínica automática · App mobile do aluno. Plataforma para profissionais CREF/CREFITO."
	/>
	<!-- PNG (não SVG): WhatsApp/Facebook/LinkedIn/X não renderizam SVG em preview -->
	<meta property="og:image" content={`${data.origin}/og-image.png`} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="PreceptorFISIC · Prescrição clínica validada" />
	<meta property="og:site_name" content="PreceptorFISIC" />
	<meta property="og:locale" content="pt_BR" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="PreceptorFISIC · Prescrição clínica validada" />
	<meta
		name="twitter:description"
		content="PreceptorFISIC com diretrizes ACSM · Validação clínica automática · App mobile do aluno."
	/>
	<meta name="twitter:image" content={`${data.origin}/og-image.png`} />

	<!-- JSON-LD structured data (SoftwareApplication) -->
	<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "PreceptorFISIC",
		"applicationCategory": "HealthApplication",
		"operatingSystem": "Web, iOS, Android",
		"description": "Plataforma de prescrição clínica de exercícios com PreceptorFISIC fundamentado em diretrizes ACSM.",
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "BRL"
		},
		"audience": {
			"@type": "Audience",
			"audienceType": "Profissionais CREF, CREFITO e CRM"
		}
	}
	</script>
</svelte:head>

<div class="lp">
	<!-- Header -->
	<header class="lp-header" class:scrolled>
		<a href="/" class="lp-brand">
			<BrandMark size={30} />
			<div>
				<div class="lp-name">Preceptor<span class="lp-name-fisic">FISIC</span></div>
				<div class="lp-sub">PRO · v3.2</div>
			</div>
		</a>

		<nav class="lp-nav" aria-label="Navegação">
			<a href="#features">Plataforma</a>
			<a href="#how">Como funciona</a>
			<a href="#pricing">Preços</a>
		</nav>

		<div class="lp-cta">
			<a href="/login" class="lp-btn lp-btn--ghost">Entrar</a>
			<!-- CTAs de cadastro abrem /login já na aba "Criar conta" -->
			<a href="/login?mode=signup" class="lp-btn lp-btn--primary">Começar agora</a>
		</div>
	</header>

	<!-- HERO -->
	<section class="hero">
		<!-- Dual video crossfade — elimina travadinha do loop nativo.
		     A e B são idênticos, defasados, alternam via opacity.
		     Quando A está nos últimos 500ms, B começa do zero + fade.
		     Loop infinito sem rebuffer visível. -->
		<!-- preload="none": nada baixa antes do JS decidir tocar (onMount).
		     Poster JPEG leve (~55KB, frame 0) cobre o vão até o 1º frame. -->
		<video
			bind:this={videoA}
			class="hero-video"
			class:on={activeVideo === 'A'}
			muted
			playsinline
			preload="none"
			poster="/hero-poster.jpg"
		>
			<source src="/hero.webm" type="video/webm" />
			<source src="/hero-1080.mp4" type="video/mp4" />
		</video>
		<video
			bind:this={videoB}
			class="hero-video"
			class:on={activeVideo === 'B'}
			muted
			playsinline
			preload="none"
			poster="/hero-poster.jpg"
		>
			<source src="/hero.webm" type="video/webm" />
			<source src="/hero-1080.mp4" type="video/mp4" />
		</video>

		<!-- Tint violeta da marca (#A78BFA) sobre o vídeo via mix-blend -->
		<div class="hero-tint"></div>

		<!-- Overlays pra contraste -->
		<div class="hero-veil"></div>
		<div class="hero-fade-bottom"></div>
		<div class="hero-fade-left"></div>

		<div class="hero-content">
			<div class="hero-eyebrow">
				<span class="hero-eyebrow-dot"></span>
				PARA PROFISSIONAIS CREF · CREFITO
			</div>

			<h1 class="hero-h1">
				Prescreva treinos<br />
				com <span class="hero-accent">rigor clínico.</span>
			</h1>

			<p class="hero-sub">
				A primeira plataforma brasileira para profissionais CREF/CREFITO que prescrevem para
				<strong>populações especiais</strong>. PreceptorFISIC fundamentado em diretrizes ACSM, validação
				clínica automática e app mobile do aluno.
			</p>

			<div class="hero-actions">
				<a href="/login?mode=signup" class="lp-btn lp-btn--primary lp-btn--lg">
					Começar agora
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14M13 5l7 7-7 7" />
					</svg>
				</a>
				<a href="#how" class="lp-btn lp-btn--secondary lp-btn--lg">Como funciona →</a>
			</div>

			<div class="hero-trust">
				<div class="hero-trust-item">
					<span class="trust-dot success"></span>
					Conformidade LGPD · dados no Brasil
				</div>
				<div class="hero-trust-divider"></div>
				<div class="hero-trust-item">
					<span class="trust-dot accent"></span>
					Diretrizes ACSM/AHA
				</div>
				<div class="hero-trust-divider"></div>
				<div class="hero-trust-item">
					<span class="trust-dot info"></span>
					Citações científicas reais
				</div>
			</div>

			<div class="hero-reviewed">
				<div class="hero-reviewed-label">Revisado por</div>
				<div class="hero-reviewed-list">
					<div class="reviewer">
						<span class="reviewer-name">José Jonas de Oliveira</span><span class="reviewer-sep"> · </span><span class="reviewer-title">Doutor em Ciência do Movimento Humano</span>
					</div>
					<div class="reviewer">
						<span class="reviewer-name">Anna Gabriela Silva Vilela Ribeiro</span><span class="reviewer-sep"> · </span><span class="reviewer-title">Doutora em Ciência do Movimento Humano</span>
					</div>
					<div class="reviewer">
						<span class="reviewer-name">Alexandre de Souza e Silva</span><span class="reviewer-sep"> · </span><span class="reviewer-title">Doutor em Ciências do Desporto</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Trust strip bottom -->
		<div class="hero-strip">
			<div class="hero-strip-label">Construído para profissionais que prescrevem para</div>
			<div class="hero-strip-tags">
				<span>Hipertensão</span>
				<span>·</span>
				<span>Diabetes</span>
				<span>·</span>
				<span>Cardiopatia</span>
				<span>·</span>
				<span>DPOC</span>
				<span>·</span>
				<span>Pós-LCA</span>
				<span>·</span>
				<span>Gestantes</span>
				<span>·</span>
				<span>Idosos frágeis</span>
				<span>·</span>
				<span>Oncológicos</span>
			</div>
		</div>
	</section>

	<!-- PAIN — nomeia o problema antes de mostrar a solução -->
	<section class="pain" id="pain">
		<div class="section-head">
			<div class="eyebrow">◈ O problema</div>
			<h2>Prescrever para população especial <em>é assinar sozinho.</em></h2>
		</div>
		<div class="pain-grid">
			{#each PAINS as p (p.title)}
				<article class="pain-card">
					<h3>{p.title}</h3>
					<p>{p.body}</p>
				</article>
			{/each}
		</div>
		<p class="pain-bridge">É por isso que existe o PreceptorFISIC.</p>
	</section>

	<!-- METRICS -->
	<section class="metrics" id="metrics">
		<div class="metrics-inner">
			{#each METRICS as m (m.l)}
				<div class="metric">
					<div class="num metric-v">{m.v}</div>
					<div class="metric-l">{m.l}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- DIFFERENTIATOR -->
	<section class="diff">
		<div class="diff-grid">
			<div class="diff-side">
				<div class="eyebrow">⊕ Diferencial</div>
				<h2>ACSM tem <em>prioridade absoluta</em> nas nossas fontes.</h2>
				<p>
					Quando duas diretrizes cobrem o mesmo ponto e uma é ACSM, a ACSM ganha. São as
					diretrizes mais técnicas e específicas para prescrição de exercício; AHA é mais ampla
					em saúde cardiovascular e menos detalhada em programação.
				</p>
				<p class="diff-quote">
					O profissional que usa PreceptorFISIC sabe disso. Quem joga no ChatGPT ou no
					Gemini, não.
				</p>
			</div>
			<div class="diff-panel">
				<div class="diff-panel-label">As fontes por trás de uma recomendação real</div>
				<div class="diff-card">
						<div class="diff-card-head">
							<span class="eyebrow">Exemplo real · prescrição para hipertenso</span>
						</div>
						<div class="diff-rows">
							<div class="diff-row hi">
								<span class="diff-tag acsm">★ ACSM</span>
								<span class="diff-row-title">Position Stand on Hypertension and Exercise</span>
							</div>
							<div class="diff-row hi">
								<span class="diff-tag acsm">★ ACSM</span>
								<span class="diff-row-title">Guidelines for Exercise Testing and Prescription, 11ed</span>
							</div>
							<div class="diff-row">
								<span class="diff-tag essa">◆ ESSA</span>
								<span class="diff-row-title">Position Statement: Exercise and Type 2 Diabetes</span>
							</div>
							<div class="diff-row hi">
								<span class="diff-tag acsm">★ ACSM</span>
								<span class="diff-row-title">Pre-participation Cardiovascular Screening</span>
							</div>
							<div class="diff-row">
								<span class="diff-tag aha">○ AHA</span>
								<span class="diff-row-title">Scientific Statement: Resistance Exercise</span>
							</div>
						</div>
						<div class="diff-foot">3 das 5 fontes desta recomendação são <span class="num">ACSM</span> ★</div>
					</div>
			</div>
		</div>
	</section>

	<!-- FEATURES -->
	<section class="features" id="features">
		<div class="section-head">
			<div class="eyebrow">◆ Plataforma</div>
			<h2>
				Prescrição com fundamentação que <br class="hide-mobile" />
				<em>aguenta auditoria.</em>
			</h2>
			<p>
				O que separa o PreceptorFISIC de planilhas, do ChatGPT genérico e de apps de
				academia: método clínico, não marketing.
			</p>
		</div>

		<div class="features-grid">
			{#each FEATURES as f (f.title)}
				<article class="feat-card">
					<div class="feat-eyebrow">{f.eyebrow}</div>
					<h3>{f.title}</h3>
					<p>{f.body}</p>
					<div class="feat-metric">
						<span class="num feat-metric-v">{f.metric}</span>
						<span class="feat-metric-l">{f.metricLabel}</span>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<!-- HOW IT WORKS -->
	<section class="how" id="how">
		<div class="section-head">
			<div class="eyebrow">◇ Fluxo</div>
			<h2>Do aluno cadastrado ao plano executado <em>em 3 passos.</em></h2>
		</div>

		<div class="how-steps">
			{#each STEPS as s, i (s.n)}
				<div class="how-step">
					<div class="how-step-num">
						<span class="num">{s.n}</span>
						{#if i < STEPS.length - 1}
							<div class="how-step-line"></div>
						{/if}
					</div>
					<div class="how-step-body">
						<h3>{s.title}</h3>
						<p>{s.body}</p>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- PRICING -->
	<section class="pricing" id="pricing">
		<div class="section-head">
			<div class="eyebrow">◆ Preços</div>
			<h2>Planos para cada fase. <em>Mesma ciência em todos.</em></h2>
			<p>Mesma qualidade científica em todos os planos: diretrizes ACSM, validação clínica e auditoria completa desde o Essencial.</p>
		</div>
		<div class="cycle-toggle" role="group" aria-label="Ciclo de cobrança">
			<button
				type="button"
				class="cycle-opt"
				class:active={cycle === 'mensal'}
				aria-pressed={cycle === 'mensal'}
				onclick={() => (cycle = 'mensal')}
			>
				Mensal
			</button>
			<button
				type="button"
				class="cycle-opt"
				class:active={cycle === 'anual'}
				aria-pressed={cycle === 'anual'}
				onclick={() => (cycle = 'anual')}
			>
				Anual
				<span class="cycle-tag">2 meses grátis</span>
			</button>
		</div>
		<div class="pricing-grid">
			{#each PLANS as plan (plan.name)}
				{@const tier = plan[cycle]}
				<article class="price-card" class:featured={plan.featured}>
					{#if plan.featured}
						<div class="price-badge">Mais popular</div>
					{/if}
					<h3>{plan.name}</h3>
					<div class="price-value">
						{#if tier.was}
							<span class="price-was">{tier.was}</span>
						{:else if cycle === 'anual'}
							<!-- mantém os preços alinhados entre cards com e sem valor cheio -->
							<span class="price-was price-was--ghost" aria-hidden="true">&nbsp;</span>
						{/if}
						<span class="num price-num">{tier.price}</span>
						<span class="price-period">{tier.period}</span>
					</div>
					{#if tier.equiv}
						<div class="price-equiv">{tier.equiv}</div>
					{:else if tier.note}
						<div class="price-equiv">{tier.note}</div>
					{/if}
					<p class="price-desc">{plan.desc}</p>
					<ul class="price-items">
						{#each plan.items as item (item)}
							<li>{item}</li>
						{/each}
					</ul>
					<a
						href={tier.href}
						class="lp-btn {plan.featured ? 'lp-btn--primary' : 'lp-btn--secondary'}"
						target={tier.href.startsWith('http') ? '_blank' : null}
						rel={tier.href.startsWith('http') ? 'noopener noreferrer' : null}
					>
						{plan.cta}
					</a>
				</article>
			{/each}
		</div>
	</section>

	<!-- FINAL CTA -->
	<section class="cta-final">
		<div class="cta-glow"></div>
		<div class="cta-inner">
			<div class="eyebrow">◆ Comece em 30 segundos</div>
			<h2>
				Da planilha pro plano <br class="hide-mobile" />
				<em>auditável de verdade.</em>
			</h2>
			<p>
				Cadastra teu primeiro aluno hoje. O primeiro plano sai em 15-30 segundos, com restrições
				clínicas detectadas e citações reais.
			</p>
			<div class="cta-actions">
				<a href="/login?mode=signup" class="lp-btn lp-btn--primary lp-btn--lg">Começar agora →</a>
				<!-- WhatsApp direto do time -->
				<a
					href="https://wa.me/553591481514?text=Ol%C3%A1%21%20Quero%20falar%20com%20algu%C3%A9m%20do%20time%20do%20PreceptorFISIC."
					class="lp-btn lp-btn--secondary lp-btn--lg"
					target="_blank"
					rel="noopener noreferrer"
				>
					Falar com um humano
				</a>
			</div>
		</div>
	</section>

	<!-- FOOTER -->
	<footer class="lp-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<BrandMark size={30} />
				<div>
					<div class="lp-name">Preceptor<span class="lp-name-fisic">FISIC</span></div>
					<div class="lp-sub">© 2026 · v3.2</div>
				</div>
			</div>
			<div class="footer-cols">
				<div>
					<div class="footer-col-h">Plataforma</div>
					<a href="#features">Features</a>
					<a href="#how">Como funciona</a>
					<a href="#pricing">Preços</a>
				</div>
				<div>
					<div class="footer-col-h">Acesso</div>
					<a href="/login">Entrar</a>
					<a href="/login?mode=signup">Cadastrar</a>
				</div>
				<div>
					<div class="footer-col-h">Conformidade</div>
					<a href="/legal/privacidade">LGPD</a>
					<a href="/legal/termos">Termos</a>
					<a href="/legal/privacidade">Privacidade</a>
				</div>
			</div>
		</div>
		<div class="footer-bot">
			<span>Construído em São Paulo · Servidores no Brasil</span>
			<span>Diretrizes ACSM · ESSA · AHA · OMS · ADA</span>
		</div>
	</footer>
</div>

<style>
	/* ─────────────────────────────────────────────
	   LANDING PAGE — PreceptorFISIC
	   Dark fit-tech · vídeo hero · contraste alto
	   ───────────────────────────────────────────── */
	.lp {
		position: relative;
		z-index: 0;
		background: var(--bg-0);
		color: var(--ink-0);
		min-height: 100vh;
		overflow-x: hidden;
	}
	/* Textura de pontos global — cobre a página inteira, sem emendas entre
	   seções. z-index:-1 mantém os pontos atrás do conteúdo; painéis com fundo
	   próprio (barra de métricas, cards) cobrem os pontos naturalmente. */
	.lp::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(#363636 1.2px, transparent 1.4px);
		background-size: 24px 24px;
		opacity: 0.5;
		pointer-events: none;
		z-index: -1;
	}
	/* Âncoras do nav (#features/#how/#metrics) param abaixo do header fixo (~70px) */
	section[id] {
		scroll-margin-top: 84px;
	}

	/* ───── HEADER ───── */
	.lp-header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 18px 32px;
		transition:
			background 200ms var(--ease),
			border-color 200ms var(--ease),
			backdrop-filter 200ms var(--ease);
	}
	.lp-header.scrolled {
		background: rgba(5, 5, 5, 0.7);
		backdrop-filter: saturate(140%) blur(14px);
		-webkit-backdrop-filter: saturate(140%) blur(14px);
		border-bottom: 1px solid var(--ink-line);
	}
	.lp-brand {
		display: flex;
		align-items: center;
		gap: 11px;
		text-decoration: none;
	}
	.lp-name {
		font: 500 15px var(--font-sans);
		color: var(--ink-0);
		letter-spacing: -0.015em;
	}
	.lp-name-fisic {
		font-weight: 700;
	}
	.lp-sub {
		font: 500 9.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-top: 1px;
	}
	.lp-nav {
		display: flex;
		gap: 28px;
	}
	.lp-nav a {
		font: 500 13.5px var(--font-sans);
		color: var(--ink-1);
		text-decoration: none;
		transition: color 140ms var(--ease);
	}
	.lp-nav a:hover {
		color: var(--ink-0);
	}
	.lp-cta {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.lp-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 38px;
		padding: 0 18px;
		border-radius: var(--r-pill);
		font: 500 13.5px var(--font-sans);
		letter-spacing: -0.005em;
		transition: all 160ms var(--ease);
		text-decoration: none;
		white-space: nowrap;
	}
	.lp-btn--lg {
		height: 48px;
		padding: 0 24px;
		font-size: 14.5px;
	}
	.lp-btn--ghost {
		color: var(--ink-1);
	}
	.lp-btn--ghost:hover {
		color: var(--ink-0);
		background: rgba(255, 255, 255, 0.05);
	}
	.lp-btn--primary {
		background: linear-gradient(180deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		font-weight: 600;
		box-shadow: var(--glow-accent), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
	}
	.lp-btn--primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 0 28px rgba(167, 139, 250, 0.5), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
	}
	.lp-btn--secondary {
		background: rgba(255, 255, 255, 0.06);
		color: var(--ink-0);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}
	.lp-btn--secondary:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	/* ───── HERO ───── */
	.hero {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 120px 32px 80px;
		overflow: hidden;
		/* Stacking context isolado pra mix-blend-mode do tint
		   só blendar com o video (não vazar pra body/sections) */
		isolation: isolate;
	}
	.hero-video {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		/* Crossfade suave de 700ms cobre os 500ms de overlap entre A e B
		   com folga — nenhum frame fica preto */
		transition: opacity 700ms ease-in-out;
		z-index: 0;
		will-change: opacity;
		transform: translateZ(0);
		backface-visibility: hidden;
		filter: saturate(1.1) contrast(1.04);
		image-rendering: high-quality;
		-webkit-transform: translateZ(0);
	}
	.hero-video.on {
		opacity: 1;
	}
	/* Tint violeta DUPLO pra dominar com a cor da marca:
	   1) hue → recolore o vídeo pra paleta lavanda (preserva detalhe)
	   2) overlay leve violeta → reforça a cor mesmo em áreas escuras */
	.hero-tint {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(135deg, rgba(167, 139, 250, 0.55), rgba(196, 181, 253, 0.4));
		mix-blend-mode: hue;
		z-index: 1;
		pointer-events: none;
	}
	.hero-tint::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(
				ellipse 90% 80% at 70% 50%,
				rgba(167, 139, 250, 0.28) 0%,
				rgba(167, 139, 250, 0.18) 50%,
				transparent 100%
			);
		mix-blend-mode: screen;
	}
	/* Overlay 1: véu sutil violeta pra dar profundidade sem matar a cor.
	   Não usa preto — usa o próprio violeta escuro pra preservar identidade */
	.hero-veil {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(
				ellipse 100% 85% at 50% 45%,
				transparent 0%,
				rgba(20, 12, 40, 0.25) 60%,
				rgba(15, 8, 30, 0.55) 100%
			);
		z-index: 2;
		pointer-events: none;
	}
	/* Overlay 2: fade pra bg-0 na base — emenda com a próxima section */
	.hero-fade-bottom {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 220px;
		background: linear-gradient(180deg, transparent 0%, rgba(15, 8, 30, 0.5) 50%, var(--bg-0) 95%);
		z-index: 3;
		pointer-events: none;
	}
	/* Overlay 3: vinheta sutil atrás do texto (violeta escuro, não preto) */
	.hero-fade-left {
		position: absolute;
		top: 8%;
		bottom: 8%;
		left: 0;
		width: 70%;
		background: radial-gradient(
			ellipse 72% 65% at 28% 50%,
			rgba(15, 8, 30, 0.45) 0%,
			rgba(15, 8, 30, 0.18) 60%,
			transparent 100%
		);
		z-index: 2;
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 4;
		max-width: 880px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		/* SEM filter:drop-shadow no parent — quando aplicado em texto com
		   background-clip:text+color:transparent (caso do gradient), a
		   sombra renderiza nos pixels transparentes e vaza pelo gradient,
		   criando efeito "preto contornado". text-shadow individual abaixo
		   funciona corretamente porque preserva o gradient. */
	}
	/* Shadow individual em cada elemento — funciona com gradient text */
	.hero-h1 {
		text-shadow:
			0 2px 8px rgba(15, 8, 30, 0.7),
			0 4px 24px rgba(15, 8, 30, 0.45);
	}
	.hero-sub {
		text-shadow: 0 1px 6px rgba(15, 8, 30, 0.7);
	}
	.hero-eyebrow,
	.hero-trust-item {
		text-shadow: 0 1px 4px rgba(15, 8, 30, 0.6);
	}
	/* O gradient text precisa de tratamento especial — aplicamos
	   text-shadow no SPAN parent, não no texto transparente em si */
	.hero-h1 .hero-accent {
		filter: drop-shadow(0 2px 12px rgba(167, 139, 250, 0.5));
	}
	.hero-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		background: rgba(167, 139, 250, 0.1);
		border: 1px solid rgba(167, 139, 250, 0.3);
		border-radius: var(--r-pill);
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		align-self: flex-start;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}
	.hero-eyebrow-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
		animation: pulse 1.8s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}
	.hero-h1 {
		font: 500 clamp(40px, 7vw, 80px)/1.02 var(--font-sans);
		letter-spacing: -0.035em;
		margin: 0;
		color: var(--ink-0);
	}
	.hero-accent {
		background: linear-gradient(120deg, var(--accent) 0%, var(--accent-2) 50%, #e0d4ff 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		font-style: italic;
		font-weight: 400;
	}
	.hero-sub {
		font: 400 clamp(15px, 1.4vw, 18px)/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
		max-width: 640px;
	}
	.hero-sub strong {
		color: var(--ink-0);
		font-weight: 600;
	}
	.hero-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.hero-trust {
		display: flex;
		gap: 16px;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 14px;
		padding-top: 18px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		max-width: 540px;
	}
	.hero-trust-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font: 500 11.5px var(--font-mono);
		color: var(--ink-1);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.hero-trust-divider {
		width: 1px;
		height: 12px;
		background: var(--ink-line);
	}
	.trust-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.trust-dot.success {
		background: var(--success);
		box-shadow: 0 0 6px var(--success);
	}
	.trust-dot.accent {
		background: var(--accent);
		box-shadow: 0 0 6px var(--accent);
	}
	.trust-dot.info {
		background: var(--info);
		box-shadow: 0 0 6px var(--info);
	}

	/* Revisado por — autoridade científica no hero */
	.hero-reviewed {
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		max-width: 640px;
	}
	.hero-reviewed-label {
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		margin-bottom: 10px;
		text-shadow: 0 1px 4px rgba(15, 8, 30, 0.7);
	}
	.hero-reviewed-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.reviewer {
		font: 400 13px var(--font-sans);
		color: var(--ink-1);
		line-height: 1.4;
		text-shadow: 0 1px 5px rgba(15, 8, 30, 0.85);
	}
	.reviewer-name {
		color: var(--ink-0);
		font-weight: 600;
	}
	.reviewer-sep {
		color: var(--ink-3);
	}
	.reviewer-title {
		color: var(--ink-1);
	}
	@media (max-width: 768px) {
		.hero-reviewed {
			margin-top: 14px;
			padding-top: 14px;
		}
		.hero-reviewed-list {
			gap: 10px;
		}
		.reviewer {
			display: flex;
			flex-direction: column;
			gap: 1px;
			font-size: 12.5px;
		}
		.reviewer-sep {
			display: none;
		}
	}

	/* Trust strip no rodapé do hero */
	.hero-strip {
		position: relative;
		z-index: 4;
		margin-top: auto;
		padding-top: 60px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.hero-strip-label {
		font: 500 10.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	.hero-strip-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		font: 500 13px var(--font-sans);
		color: var(--ink-1);
	}
	.hero-strip-tags span:nth-child(odd) {
		color: var(--accent-2);
	}

	/* ───── METRICS BAR ───── */
	.metrics {
		position: relative;
		z-index: 4;
		background: var(--bg-1);
		border-top: 1px solid var(--ink-line);
		border-bottom: 1px solid var(--ink-line);
	}
	.metrics-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 28px 32px;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
	}
	.metric {
		text-align: center;
	}
	.metric-v {
		font: 600 28px var(--font-mono);
		color: var(--ink-0);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.metric-l {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-top: 4px;
	}

	/* ───── SECTIONS ───── */
	.section-head {
		max-width: 760px;
		margin-bottom: 56px;
	}
	.section-head .eyebrow {
		font: 600 17px var(--font-mono);
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin-bottom: 16px;
	}
	.section-head h2 {
		font: 500 clamp(32px, 4.5vw, 52px)/1.1 var(--font-sans);
		letter-spacing: -0.028em;
		margin: 0 0 16px;
		color: var(--ink-0);
	}
	.section-head h2 em {
		color: var(--accent-2);
		font-style: italic;
		font-weight: 400;
	}
	.section-head p {
		font: 400 16px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
		max-width: 580px;
	}

	/* PAIN */
	.pain {
		padding: 100px 32px 56px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}
	.pain-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.pain-card {
		padding: 26px 26px 22px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
	}
	.pain-card h3 {
		font: 600 19px var(--font-sans);
		letter-spacing: -0.015em;
		margin: 0 0 8px;
		color: var(--accent);
	}
	.pain-card p {
		font: 400 14px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
	}
	.pain-bridge {
		margin: 56px auto 0;
		max-width: 900px;
		text-align: center;
		font: 600 clamp(34px, 5vw, 56px)/1.12 var(--font-sans);
		font-style: italic;
		letter-spacing: -0.025em;
		color: var(--accent-2);
	}

	/* FEATURES */
	.features {
		padding: 100px 32px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}
	.features-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 14px;
	}
	.feat-card {
		padding: 28px 28px 22px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 240px;
		position: relative;
		overflow: hidden;
		transition: border-color 200ms var(--ease), transform 200ms var(--ease);
	}
	.feat-card::before {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 200px;
		height: 200px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 65%);
		opacity: 0;
		transition: opacity 260ms var(--ease);
		pointer-events: none;
	}
	.feat-card:hover {
		border-color: rgba(167, 139, 250, 0.4);
		transform: translateY(-2px);
	}
	.feat-card:hover::before {
		opacity: 1;
	}
	.feat-eyebrow {
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.feat-card h3 {
		font: 500 22px var(--font-sans);
		letter-spacing: -0.018em;
		margin: 0;
		color: var(--ink-0);
	}
	.feat-card p {
		font: 400 14px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
		flex: 1;
	}
	.feat-metric {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--ink-line);
		margin-top: 4px;
	}
	.feat-metric-v {
		font: 600 20px var(--font-mono);
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.feat-metric-l {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* HOW IT WORKS */
	.how {
		padding: 100px 32px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
		background: linear-gradient(180deg, transparent 0%, rgba(167, 139, 250, 0.025) 50%, transparent 100%);
	}
	.how-steps {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.how-step {
		display: grid;
		grid-template-columns: 100px 1fr;
		gap: 24px;
		padding: 32px 0;
	}
	.how-step:first-child {
		padding-top: 0;
	}
	.how-step:last-child {
		padding-bottom: 0;
	}
	.how-step-num {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.how-step-num .num {
		font: 600 32px var(--font-mono);
		color: var(--accent);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}
	.how-step-line {
		flex: 1;
		width: 1px;
		background: linear-gradient(180deg, var(--accent-dim) 0%, var(--ink-line) 100%);
		margin-top: 12px;
		min-height: 80px;
	}
	.how-step-body h3 {
		font: 500 22px var(--font-sans);
		letter-spacing: -0.018em;
		margin: 0 0 8px;
		color: var(--ink-0);
	}
	.how-step-body p {
		font: 400 15px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
		max-width: 520px;
	}

	/* DIFFERENTIATOR */
	.diff {
		padding: 100px 32px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}
	.diff-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 56px;
		align-items: center;
	}
	.diff-side .eyebrow {
		font: 600 17px var(--font-mono);
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin-bottom: 16px;
	}
	.diff-side h2 {
		font: 500 clamp(28px, 3.5vw, 40px)/1.1 var(--font-sans);
		letter-spacing: -0.028em;
		margin: 0 0 18px;
		color: var(--ink-0);
	}
	.diff-side h2 em {
		color: var(--accent-2);
		font-style: italic;
		font-weight: 400;
	}
	.diff-side p {
		font: 400 15px/1.6 var(--font-sans);
		color: var(--ink-1);
		margin: 0 0 14px;
	}
	/* Destaque visual da seção: a frase, não o painel técnico */
	.diff-side .diff-quote {
		padding: 18px 22px;
		background: var(--bg-1);
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--r-2) var(--r-2) 0;
		font: 400 clamp(17px, 1.8vw, 21px)/1.45 var(--font-sans);
		font-style: italic;
		color: var(--ink-0);
	}
	.diff-panel-label {
		font: 500 12px var(--font-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 12px;
	}
	.diff-card {
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 18px;
		font: 400 13px var(--font-mono);
	}
	.diff-card-head {
		padding-bottom: 12px;
		border-bottom: 1px solid var(--ink-line);
		margin-bottom: 10px;
	}
	.diff-card-head .eyebrow {
		font: 500 10.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.diff-rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.diff-row {
		display: grid;
		grid-template-columns: 80px 1fr;
		gap: 12px;
		align-items: center;
		padding: 10px 12px;
		border-radius: var(--r-1);
		background: var(--bg-2);
	}
	.diff-row.hi {
		background: rgba(167, 139, 250, 0.1);
		border: 1px solid rgba(167, 139, 250, 0.25);
	}
	.diff-tag {
		font: 600 10px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: center;
		padding: 3px 6px;
		border-radius: 3px;
	}
	.diff-tag.acsm {
		background: rgba(167, 139, 250, 0.18);
		color: var(--accent-2);
	}
	.diff-tag.essa {
		background: rgba(96, 165, 250, 0.15);
		color: var(--info);
	}
	.diff-tag.aha {
		background: rgba(255, 255, 255, 0.05);
		color: var(--ink-3);
	}
	.diff-row-title {
		font: 500 12.5px var(--font-sans);
		color: var(--ink-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.diff-row.hi .diff-row-title {
		color: var(--ink-0);
	}
	.diff-foot {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--ink-line);
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.diff-foot .num {
		color: var(--accent-2);
	}

	/* PRICING */
	.pricing {
		padding: 100px 32px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		box-sizing: border-box;
	}
	/* Toggle mensal/anual */
	.cycle-toggle {
		display: flex;
		width: fit-content;
		gap: 4px;
		padding: 4px;
		margin: 0 auto 28px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-pill);
	}
	.cycle-opt {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 18px;
		border: none;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		font: 500 13px var(--font-sans);
		cursor: pointer;
		transition:
			background 0.16s ease,
			color 0.16s ease;
	}
	.cycle-opt:hover {
		color: var(--ink-0);
	}
	.cycle-opt.active {
		background: var(--accent);
		color: #0a0a0a;
	}
	.cycle-tag {
		font: 600 10px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		padding: 2px 7px;
		border-radius: var(--r-pill);
		background: rgba(167, 139, 250, 0.16);
		color: var(--accent);
	}
	.cycle-opt.active .cycle-tag {
		background: rgba(10, 10, 10, 0.16);
		color: #0a0a0a;
	}
	/* Preço cheio riscado + equivalência mensal no ciclo anual */
	.price-was {
		flex-basis: 100%;
		font: 500 12px var(--font-mono);
		color: var(--ink-3);
		text-decoration: line-through;
		font-variant-numeric: tabular-nums;
	}
	.price-was--ghost {
		visibility: hidden;
	}
	.price-equiv {
		font: 500 11.5px var(--font-mono);
		color: var(--accent);
		letter-spacing: 0.02em;
	}
	.pricing-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
		align-items: stretch;
	}
	.price-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 26px 24px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
	}
	.price-card.featured {
		border-color: rgba(167, 139, 250, 0.45);
		background: rgba(167, 139, 250, 0.06);
	}
	.price-badge {
		position: absolute;
		top: -11px;
		left: 24px;
		padding: 3px 10px;
		background: linear-gradient(180deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		border-radius: var(--r-pill);
		font: 600 10.5px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.price-card h3 {
		font: 500 18px var(--font-sans);
		letter-spacing: -0.015em;
		margin: 0;
		color: var(--ink-0);
	}
	.price-value {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}
	.price-num {
		font: 600 28px var(--font-mono);
		color: var(--ink-0);
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.price-period {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.price-desc {
		font: 400 13.5px/1.5 var(--font-sans);
		color: var(--ink-1);
		margin: 0;
	}
	.price-items {
		list-style: none;
		margin: 0;
		padding: 12px 0 16px;
		border-top: 1px solid var(--ink-line);
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}
	.price-items li {
		font: 400 13px/1.4 var(--font-sans);
		color: var(--ink-1);
		padding-left: 18px;
		position: relative;
	}
	.price-items li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--accent);
		font-weight: 600;
	}

	/* FINAL CTA */
	.cta-final {
		position: relative;
		padding: 120px 32px;
		text-align: center;
		overflow: hidden;
		border-top: 1px solid var(--ink-line);
	}
	.cta-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 700px;
		height: 700px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 65%);
		opacity: 0.4;
		pointer-events: none;
	}
	.cta-inner {
		position: relative;
		z-index: 1;
		max-width: 760px;
		margin: 0 auto;
	}
	.cta-inner .eyebrow {
		font: 600 17px var(--font-mono);
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin-bottom: 16px;
	}
	.cta-inner h2 {
		font: 500 clamp(36px, 5vw, 56px)/1.05 var(--font-sans);
		letter-spacing: -0.03em;
		margin: 0 0 18px;
		color: var(--ink-0);
	}
	.cta-inner h2 em {
		color: var(--accent-2);
		font-style: italic;
		font-weight: 400;
	}
	.cta-inner p {
		font: 400 17px/1.55 var(--font-sans);
		color: var(--ink-1);
		margin: 0 0 32px;
	}
	.cta-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		flex-wrap: wrap;
	}

	/* FOOTER */
	.lp-footer {
		background: var(--bg-0);
		border-top: 1px solid var(--ink-line);
		padding: 60px 32px 32px;
	}
	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 56px;
		padding-bottom: 40px;
		border-bottom: 1px solid var(--ink-line);
	}
	.footer-brand {
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.footer-cols {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 32px;
	}
	.footer-col-h {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 12px;
	}
	.footer-cols a {
		display: block;
		font: 400 13.5px var(--font-sans);
		color: var(--ink-1);
		text-decoration: none;
		padding: 4px 0;
		transition: color 140ms var(--ease);
	}
	.footer-cols a:hover {
		color: var(--ink-0);
	}
	.footer-bot {
		max-width: 1200px;
		margin: 0 auto;
		padding-top: 24px;
		display: flex;
		justify-content: space-between;
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		flex-wrap: wrap;
		gap: 12px;
	}

	/* ─────── MOBILE ─────── */
	@media (max-width: 768px) {
		.hide-mobile {
			display: none;
		}
		.lp-header {
			padding: 14px 18px;
		}
		.lp-nav {
			display: none;
		}
		.lp-cta .lp-btn--ghost {
			display: none;
		}
		.lp-name {
			font-size: 14px;
		}

		.hero {
			padding: 100px 18px 48px;
			min-height: 88vh;
		}
		.hero-h1 {
			font-size: clamp(34px, 11vw, 56px);
		}
		.hero-actions {
			width: 100%;
			flex-direction: column;
			gap: 10px;
		}
		.hero-actions .lp-btn {
			width: 100%;
			box-sizing: border-box;
		}
		.hero-trust {
			gap: 10px;
		}
		.hero-trust-divider {
			display: none;
		}
		.hero-strip {
			padding-top: 40px;
		}

		.metrics-inner {
			grid-template-columns: repeat(2, 1fr);
			gap: 18px 24px;
			padding: 22px 18px;
		}
		.metric-v {
			font-size: 22px;
		}

		.features,
		.how,
		.diff,
		.pain,
		.pricing {
			padding: 64px 18px;
		}
		.pain-grid {
			grid-template-columns: 1fr;
		}
		.pain-bridge {
			margin-top: 28px;
		}
		.pricing-grid {
			grid-template-columns: 1fr;
		}
		.price-card.featured {
			order: -1;
		}
		.section-head {
			margin-bottom: 36px;
		}
		.features-grid {
			grid-template-columns: 1fr;
		}
		.feat-card {
			min-height: 0;
			padding: 22px;
		}

		.how-step {
			grid-template-columns: 60px 1fr;
			gap: 16px;
			padding: 24px 0;
		}
		.how-step-num .num {
			font-size: 24px;
		}

		.diff-grid {
			grid-template-columns: 1fr;
			gap: 36px;
		}
		.diff-row {
			grid-template-columns: 60px 1fr;
			gap: 8px;
			padding: 8px 10px;
		}
		.diff-row-title {
			font-size: 11.5px;
		}

		.cta-final {
			padding: 80px 18px;
		}
		.cta-actions {
			flex-direction: column;
		}
		.cta-actions .lp-btn {
			width: 100%;
			box-sizing: border-box;
		}

		.lp-footer {
			padding: 40px 18px 24px;
		}
		.footer-inner {
			grid-template-columns: 1fr;
			gap: 32px;
			padding-bottom: 28px;
		}
		.footer-cols {
			grid-template-columns: 1fr 1fr;
			gap: 24px;
		}
		.footer-bot {
			flex-direction: column;
			gap: 6px;
		}
	}

	/* prefers-reduced-motion: pausa o vídeo + remove animações */
	@media (prefers-reduced-motion: reduce) {
		.hero-video {
			display: none;
		}
		.hero {
			background: radial-gradient(ellipse at 50% 30%, rgba(167, 139, 250, 0.15) 0%, var(--bg-0) 60%);
		}
		.hero-eyebrow-dot {
			animation: none;
		}
	}
</style>
