<script lang="ts">
	import { onMount } from 'svelte';

	let videoEl: HTMLVideoElement | undefined = $state();
	let videoReady = $state(false);
	let scrolled = $state(false);

	onMount(() => {
		const onScroll = () => {
			scrolled = window.scrollY > 8;
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	const FEATURES = [
		{
			eyebrow: '◆ IA + RAG',
			title: 'Geração com diretrizes',
			body: 'Gemini 2.5 Flash com retrieval-augmented sobre ACSM, AHA, OMS e ESSA. Citações reais com chunk_id, página e organização — não invenção.',
			metric: '2.040 chunks',
			metricLabel: 'indexados'
		},
		{
			eyebrow: '◇ Validação clínica',
			title: 'Engine de regras',
			body: 'Cada plano gerado passa por 23 regras clínicas (LCA, hipertensão, cardiopatia, gestação, DPOC...). Detecta contraindicações antes da publicação.',
			metric: '23 regras',
			metricLabel: 'automáticas'
		},
		{
			eyebrow: '◈ App do aluno',
			title: 'Magic-link mobile',
			body: 'Aluno acessa pelo celular sem login, sem app store. Hoje · Plano · Histórico. PWA instalável. Profissional acompanha aderência em tempo real.',
			metric: 'PWA',
			metricLabel: 'sem app store'
		},
		{
			eyebrow: '⊕ Auditoria',
			title: 'Cada decisão registrada',
			body: 'Todo plano salva input prompt, chunks recuperados, modelo usado, tokens, latência e versão do system prompt. Drift de qualidade é mensurável.',
			metric: 'ai_runs',
			metricLabel: 'imutável'
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
			title: 'Gere com IA',
			body: 'Plano sai em 15-30s — você vê materializando ao vivo. ACSM tem prioridade no RAG. Validação clínica automática antes de publicar.'
		},
		{
			n: '03',
			title: 'Aluno recebe magic-link',
			body: 'Link único pro celular dele. Treino do dia, registro de séries, histórico de aderência. Sem fricção, sem login.'
		}
	];

	const METRICS = [
		{ v: '15-30s', l: 'tempo de geração' },
		{ v: '94%', l: 'aderência média' },
		{ v: 'sa-east-1', l: 'região BR · LGPD' },
		{ v: 'ACSM ★', l: 'preferência RAG' }
	];
</script>

<svelte:head>
	<title>Preceptor Fisic — Prescrição clínica com IA validada</title>
	<meta
		name="description"
		content="Plataforma para profissionais CREF/CREFITO que prescrevem exercícios para populações especiais. IA com diretrizes ACSM, validação clínica automática, app mobile do aluno."
	/>
</svelte:head>

<div class="lp">
	<!-- Header -->
	<header class="lp-header" class:scrolled>
		<a href="/" class="lp-brand">
			<div class="lp-logo">P</div>
			<div>
				<div class="lp-name">Preceptor Fisic</div>
				<div class="lp-sub">PRO · v3.2</div>
			</div>
		</a>

		<nav class="lp-nav" aria-label="Navegação">
			<a href="#features">Plataforma</a>
			<a href="#how">Como funciona</a>
			<a href="#metrics">Resultados</a>
		</nav>

		<div class="lp-cta">
			<a href="/login" class="lp-btn lp-btn--ghost">Entrar</a>
			<a href="/login" class="lp-btn lp-btn--primary">Começar grátis</a>
		</div>
	</header>

	<!-- HERO -->
	<section class="hero">
		<!-- Video bg
			Ordem dos sources: WebM VP9 1080p (Chrome/FF/Edge — 6.7MB)
			MP4 H.264 1080p   (Safari/iOS — 11.8MB)
			Browser pega o primeiro que entender. -->
		<video
			bind:this={videoEl}
			class="hero-video"
			class:on={videoReady}
			autoplay
			loop
			muted
			playsinline
			preload="auto"
			poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%23050505'/%3E%3C/svg%3E"
			oncanplay={() => (videoReady = true)}
		>
			<source src="/hero.webm" type="video/webm" />
			<source src="/hero-1080.mp4" type="video/mp4" />
		</video>

		<!-- Overlays pra contraste -->
		<div class="hero-veil"></div>
		<div class="hero-fade-bottom"></div>
		<div class="hero-fade-left"></div>

		<div class="hero-content">
			<div class="hero-eyebrow">
				<span class="hero-eyebrow-dot"></span>
				CONFORMIDADE LGPD · DADOS NA REGIÃO BR
			</div>

			<h1 class="hero-h1">
				Prescreva treinos<br />
				com <span class="hero-accent">rigor clínico.</span>
			</h1>

			<p class="hero-sub">
				A primeira plataforma brasileira para profissionais CREF/CREFITO que prescrevem para
				<strong>populações especiais</strong> — com IA fundamentada em diretrizes ACSM, validação
				clínica automática e app mobile do aluno.
			</p>

			<div class="hero-actions">
				<a href="/login" class="lp-btn lp-btn--primary lp-btn--lg">
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
					Validado pelo CONFEF
				</div>
				<div class="hero-trust-divider"></div>
				<div class="hero-trust-item">
					<span class="trust-dot accent"></span>
					Diretrizes ACSM/AHA
				</div>
				<div class="hero-trust-divider"></div>
				<div class="hero-trust-item">
					<span class="trust-dot info"></span>
					Gemini 2.5 + RAG
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

	<!-- METRICS -->
	<section class="metrics" id="metrics">
		<div class="metrics-inner">
			{#each METRICS as m, i (m.l)}
				<div class="metric" class:divider={i > 0}>
					<div class="num metric-v">{m.v}</div>
					<div class="metric-l">{m.l}</div>
				</div>
			{/each}
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
				Quatro pilares que separam Preceptor Fisic de planilhas, ChatGPT genérico e apps de
				academia. Construído pelo método clínico, não pelo marketing.
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

	<!-- DIFFERENTIATOR -->
	<section class="diff">
		<div class="diff-grid">
			<div class="diff-side">
				<div class="eyebrow">⊕ Diferencial técnico</div>
				<h2>Por que ACSM tem <em>preferência absoluta</em> no nosso RAG.</h2>
				<p>
					Quando dois chunks cobrem o mesmo ponto e um é ACSM, outro é AHA, o ACSM ganha boost de
					ranking. As diretrizes ACSM são as mais técnicas e específicas para prescrição de
					exercício; AHA é mais ampla em saúde cardiovascular e menos detalhada em programação.
				</p>
				<p class="diff-note">
					O profissional que usa Preceptor sabe disso. O que usa ChatGPT não.
				</p>
			</div>
			<div class="diff-card">
				<div class="diff-card-head">
					<span class="eyebrow">RAG context · top 8 chunks</span>
				</div>
				<div class="diff-rows">
					<div class="diff-row hi">
						<span class="diff-tag acsm">★ ACSM</span>
						<span class="diff-row-title">Position Stand on Hypertension and Exercise</span>
						<span class="num diff-dist">0.142</span>
					</div>
					<div class="diff-row hi">
						<span class="diff-tag acsm">★ ACSM</span>
						<span class="diff-row-title">Guidelines for Exercise Testing and Prescription, 11ed</span>
						<span class="num diff-dist">0.158</span>
					</div>
					<div class="diff-row">
						<span class="diff-tag essa">◆ ESSA</span>
						<span class="diff-row-title">Position Statement: Exercise and Type 2 Diabetes</span>
						<span class="num diff-dist">0.171</span>
					</div>
					<div class="diff-row hi">
						<span class="diff-tag acsm">★ ACSM</span>
						<span class="diff-row-title">Pre-participation Cardiovascular Screening</span>
						<span class="num diff-dist">0.183</span>
					</div>
					<div class="diff-row low">
						<span class="diff-tag aha">○ AHA</span>
						<span class="diff-row-title">Scientific Statement: Resistance Exercise</span>
						<span class="num diff-dist">0.197</span>
					</div>
				</div>
				<div class="diff-foot">org_distribution: <span class="num">acsm:3 · essa:1 · aha:1</span></div>
			</div>
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
				<a href="/login" class="lp-btn lp-btn--primary lp-btn--lg">Começar grátis →</a>
				<a href="mailto:hello@preceptorfisic.com" class="lp-btn lp-btn--secondary lp-btn--lg">
					Falar com um humano
				</a>
			</div>
			<div class="cta-fineprint">
				Sem cartão de crédito · Sem app store · Dados em São Paulo · LGPD compliant
			</div>
		</div>
	</section>

	<!-- FOOTER -->
	<footer class="lp-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<div class="lp-logo">P</div>
				<div>
					<div class="lp-name">Preceptor Fisic</div>
					<div class="lp-sub">© 2026 · v3.2</div>
				</div>
			</div>
			<div class="footer-cols">
				<div>
					<div class="footer-col-h">Plataforma</div>
					<a href="#features">Features</a>
					<a href="#how">Como funciona</a>
					<a href="#metrics">Resultados</a>
				</div>
				<div>
					<div class="footer-col-h">Acesso</div>
					<a href="/login">Entrar</a>
					<a href="/login">Cadastrar</a>
				</div>
				<div>
					<div class="footer-col-h">Conformidade</div>
					<a href="#">LGPD</a>
					<a href="#">Termos</a>
					<a href="#">Privacidade</a>
				</div>
			</div>
		</div>
		<div class="footer-bot">
			<span>Construído em São Paulo · Região sa-east-1</span>
			<span>Diretrizes ACSM · ESSA · AHA · OMS · ADA</span>
		</div>
	</footer>
</div>

<style>
	/* ─────────────────────────────────────────────
	   LANDING PAGE — Preceptor Fisic
	   Dark fit-tech · vídeo hero · contraste alto
	   ───────────────────────────────────────────── */
	.lp {
		background: var(--bg-0);
		color: var(--ink-0);
		min-height: 100vh;
		overflow-x: hidden;
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
	.lp-logo {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		color: #0a0a0a;
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 16px var(--font-sans);
		box-shadow: var(--glow-accent);
		flex-shrink: 0;
	}
	.lp-name {
		font: 600 15px var(--font-sans);
		color: var(--ink-0);
		letter-spacing: -0.015em;
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
		color: #0a0a0a;
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
	}
	.hero-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transition: opacity 800ms var(--ease);
		z-index: 0;
		/* Hardware accel — força decodificação na GPU, evita banding */
		will-change: transform, opacity;
		transform: translateZ(0);
		backface-visibility: hidden;
		/* Compensa o upscale de 720p pra full-HD: aviva cores e contraste */
		filter: saturate(1.18) contrast(1.06) brightness(1.02);
		image-rendering: high-quality;
		-webkit-transform: translateZ(0);
	}
	.hero-video.on {
		opacity: 1;
	}
	/* Overlay 1: vinheta sutil — escurece SÓ os cantos extremos, preserva o video no meio */
	.hero-veil {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 70% at 50% 45%,
			transparent 0%,
			rgba(5, 5, 5, 0.15) 60%,
			rgba(5, 5, 5, 0.55) 100%
		);
		z-index: 1;
		pointer-events: none;
	}
	/* Overlay 2: fade pra preto na base — emenda com a próxima section */
	.hero-fade-bottom {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 200px;
		background: linear-gradient(180deg, transparent 0%, rgba(5, 5, 5, 0.4) 50%, var(--bg-0) 95%);
		z-index: 2;
		pointer-events: none;
	}
	/* Overlay 3: vinheta atrás do texto SOMENTE — não cobre o vídeo todo.
	   Posicionada à esquerda, com elipse suave, dá peso pra leitura sem
	   sacrificar 50% do vídeo como antes. */
	.hero-fade-left {
		position: absolute;
		top: 10%;
		bottom: 10%;
		left: 0;
		width: 65%;
		background: radial-gradient(
			ellipse 70% 60% at 30% 50%,
			rgba(5, 5, 5, 0.45) 0%,
			rgba(5, 5, 5, 0.18) 60%,
			transparent 100%
		);
		z-index: 1;
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 3;
		max-width: 880px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		/* Halo escuro grudado nos glifos — preserva o vídeo de fundo
		   intacto E garante contraste local de cada caractere */
		filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.85))
			drop-shadow(0 2px 18px rgba(0, 0, 0, 0.6));
	}
	.hero-content :global(h1),
	.hero-content :global(p),
	.hero-content :global(.hero-eyebrow),
	.hero-content :global(.hero-trust-item) {
		/* Reforço extra de text-shadow pra browsers que renderizam
		   drop-shadow com perda de qualidade em filtros aninhados */
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 2px 12px rgba(0, 0, 0, 0.5);
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

	/* Trust strip no rodapé do hero */
	.hero-strip {
		position: relative;
		z-index: 3;
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
		grid-template-columns: repeat(4, 1fr);
		gap: 20px;
	}
	.metric.divider {
		border-left: 1px solid var(--ink-line);
		padding-left: 20px;
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
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 12px;
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
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 12px;
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
	.diff-note {
		padding: 14px 18px;
		background: var(--bg-1);
		border-left: 2px solid var(--accent);
		border-radius: 0 var(--r-2) var(--r-2) 0;
		font-style: italic;
		color: var(--ink-0);
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
		grid-template-columns: 80px 1fr 60px;
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
	.diff-row.low {
		opacity: 0.5;
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
	.diff-dist {
		font: 500 12px var(--font-mono);
		color: var(--ink-3);
		text-align: right;
		font-variant-numeric: tabular-nums;
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

	/* FINAL CTA */
	.cta-final {
		position: relative;
		padding: 120px 32px;
		text-align: center;
		overflow: hidden;
		border-top: 1px solid var(--ink-line);
		background: var(--bg-1);
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
		font: 500 11px var(--font-mono);
		color: var(--accent-2);
		text-transform: uppercase;
		letter-spacing: 0.1em;
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
	.cta-fineprint {
		margin-top: 24px;
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
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
		.metric.divider {
			border-left: none;
			padding-left: 0;
		}
		.metric.divider:nth-child(odd) {
			border-left: 1px solid var(--ink-line);
			padding-left: 24px;
		}
		.metric-v {
			font-size: 22px;
		}

		.features,
		.how,
		.diff {
			padding: 64px 18px;
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
			grid-template-columns: 60px 1fr 50px;
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
