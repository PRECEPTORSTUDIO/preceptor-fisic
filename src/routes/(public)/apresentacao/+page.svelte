<script lang="ts">
	import { BrandMark } from '$lib/components/ui';

	// Perfil selecionado. O tronco da página (o que a plataforma faz) é comum
	// aos dois; só o bloco de argumento e a tabela de planos trocam.
	let perfil = $state<'autonomo' | 'clinica'>('autonomo');

	const MODULOS = [
		{
			t: 'Ficha clínica do aluno',
			d: 'Diagnósticos, medicações em uso, lesões e limitações, nível de experiência, objetivos e equipamento disponível. É o que sustenta toda a prescrição depois.'
		},
		{
			t: 'Avaliação física',
			d: 'Antropometria com IMC na hora, bioimpedância, dados cardiovasculares e observações. Fica no histórico e serve de comparação nos retornos.'
		},
		{
			t: 'Risco cardiovascular',
			d: 'Escore de Risco Global da SBC calculado no cadastro. O risco estratificado entra na prescrição e aparece na ficha do aluno.'
		},
		{
			t: 'Geração do treino',
			d: 'Plano completo em 15 a 30 segundos, com consulta a ACSM, AHA, OMS e ESSA. Cada recomendação cita a fonte, com página e organização.'
		},
		{
			t: 'Validação clínica',
			d: '23 regras rodam sobre todo plano gerado, antes de você publicar. Contraindicação séria bloqueia a publicação até você tratar.'
		},
		{
			t: 'Revisão livre',
			d: 'Trocar exercício, editar séries e carga, reordenar dentro do bloco ou excluir. O plano é seu, a geração é o ponto de partida.'
		},
		{
			t: 'Aplicativo do aluno',
			d: 'Abre por link, sem conta, sem senha e sem loja de aplicativos. Treino do dia, registro de carga e percepção de esforço a cada série.'
		},
		{
			t: 'Acompanhamento',
			d: 'Aderência, sequência de dias treinados e histórico atualizados na hora. O painel abre com quem não treinou e quem sumiu.'
		},
		{
			t: 'Catálogo de exercícios',
			d: 'Mais de mil exercícios com vídeo de execução, indexados por grupo muscular, além dos que você mesmo cadastrar.'
		},
		{
			t: 'Mensagens e agenda',
			d: 'Conversa com o aluno tendo o histórico clínico ao lado, e a agenda da semana para reavaliações e presenciais.'
		},
		{
			t: 'Registro de cada decisão',
			d: 'Todo plano guarda o que foi consultado, o que foi gerado e o que você alterou. Trilha completa, para consulta a qualquer momento.'
		},
		{
			t: 'PDF do plano',
			d: 'Versão para imprimir ou arquivar, com a identificação do profissional responsável.'
		}
	];

	const PASSOS = [
		{ n: '01', t: 'Cadastre o aluno', d: 'Você preenche a ficha clínica ou envia um link para o aluno completar pelo celular.' },
		{ n: '02', t: 'Gere o plano', d: 'A plataforma consulta as diretrizes e monta a periodização em segundos, com as fontes citadas.' },
		{ n: '03', t: 'Revise e assine', d: 'As restrições aparecem por gravidade. Você ajusta o que quiser e publica sob sua responsabilidade técnica.' },
		{ n: '04', t: 'Acompanhe', d: 'O aluno treina pelo celular e registra cada série. Você vê a aderência em tempo real.' }
	];

	const PLANOS_AUTONOMO = [
		{
			nome: 'Essencial',
			mes: 'R$ 69,90',
			ano: 'R$ 699,00',
			para: 'Para quem já atende população especial no dia a dia.',
			itens: ['Até 60 alunos ativos', 'Até 20 treinos gerados por mês', 'Histórico completo de planos', 'Suporte por e-mail'],
			destaque: false
		},
		{
			nome: 'Pro',
			mes: 'R$ 149,90',
			ano: 'R$ 1.498,80',
			para: 'Para quem vive de prescrição clínica.',
			itens: ['Até 150 alunos ativos', 'Até 50 treinos gerados por mês', 'Auditoria completa de cada plano', 'Prioridade na geração'],
			destaque: true
		}
	];

	const ARG_AUTONOMO = [
		{
			t: 'A responsabilidade continua sua, o respaldo não',
			d: 'Cada plano chega com a diretriz que sustenta a recomendação e passa por checagem de contraindicação antes de você publicar. Você assina sabendo em que se apoiou.'
		},
		{
			t: 'A pesquisa que tomava a noite',
			d: 'Conferir diretriz para um hipertenso, uma gestante e um pós-cirúrgico levava horas. A consulta às fontes passa a ser parte da geração.'
		},
		{
			t: 'Atender mais sem perder o cuidado',
			d: 'A ficha clínica, o histórico e a aderência ficam num lugar só. Você acompanha mais alunos sem depender de planilha e memória.'
		}
	];

	const ARG_CLINICA = [
		{
			t: 'O mesmo critério em toda a equipe',
			d: 'As diretrizes e as regras de segurança são as mesmas para todos os profissionais. O cuidado deixa de variar conforme quem atendeu.'
		},
		{
			t: 'Cada prescrição com responsável identificado',
			d: 'Todo plano fica registrado em nome de quem publicou, com o histórico do que foi gerado e do que foi alterado.'
		},
		{
			t: 'Onboarding sem travar a operação',
			d: 'Profissional novo entra com o mesmo padrão de prescrição desde o primeiro aluno, sem depender de treinamento longo.'
		}
	];
</script>

<svelte:head>
	<title>A plataforma PreceptorFISIC</title>
	<meta
		name="description"
		content="Prescrição de treino para população especial com fundamento em diretrizes clínicas e validação automática. Conheça a plataforma."
	/>
</svelte:head>

<div class="ap">
	<header class="ap-head">
		<a class="ap-brand" href="/">
			<BrandMark size={30} />
			<span class="wm"><span class="wm-a">Preceptor</span><span class="wm-b">FISIC</span></span>
		</a>
		<a class="btn btn-sm" href="/login?mode=signup">Começar agora</a>
	</header>

	<section class="hero">
		<div class="eyebrow">Para profissionais CREF e CREFITO</div>
		<h1>Prescrição para população especial com <em>diretriz por trás</em>.</h1>
		<p class="lead">
			O PreceptorFISIC monta o plano de treino a partir da ficha clínica do aluno, consulta as
			diretrizes reconhecidas na área e roda uma checagem de contraindicação antes de o plano chegar
			ao aluno. Você revisa, ajusta e publica sob sua responsabilidade técnica.
		</p>
		<div class="hero-marks">
			<span>ACSM · AHA · OMS · ESSA</span>
			<span>23 regras clínicas</span>
			<span>Dados no Brasil · LGPD</span>
		</div>
	</section>

	<section class="bloco">
		<div class="sec-head">
			<div class="eyebrow">O que tem dentro</div>
			<h2>A plataforma por inteiro</h2>
			<p>Do cadastro do aluno ao acompanhamento da aderência, sem trocar de ferramenta.</p>
		</div>
		<div class="mods">
			{#each MODULOS as m (m.t)}
				<article class="mod">
					<h3>{m.t}</h3>
					<p>{m.d}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="bloco alt">
		<div class="sec-head">
			<div class="eyebrow">Como funciona</div>
			<h2>Quatro passos, do cadastro ao treino</h2>
		</div>
		<div class="passos">
			{#each PASSOS as p (p.n)}
				<article class="passo">
					<span class="passo-n">{p.n}</span>
					<h3>{p.t}</h3>
					<p>{p.d}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="bloco">
		<div class="sec-head">
			<div class="eyebrow">Para o seu caso</div>
			<h2>Escolha o seu perfil</h2>
			<p>O restante da página se ajusta ao que você faz.</p>
		</div>

		<div class="switch" role="tablist" aria-label="Perfil">
			<button
				role="tab"
				aria-selected={perfil === 'autonomo'}
				class:on={perfil === 'autonomo'}
				onclick={() => (perfil = 'autonomo')}
			>
				Profissional autônomo
			</button>
			<button
				role="tab"
				aria-selected={perfil === 'clinica'}
				class:on={perfil === 'clinica'}
				onclick={() => (perfil = 'clinica')}
			>
				Clínica, academia ou estúdio
			</button>
		</div>

		{#if perfil === 'autonomo'}
			<div class="args">
				{#each ARG_AUTONOMO as a (a.t)}
					<article class="arg">
						<h3>{a.t}</h3>
						<p>{a.d}</p>
					</article>
				{/each}
			</div>

			<div class="planos">
				{#each PLANOS_AUTONOMO as p (p.nome)}
					<article class="plano" class:destaque={p.destaque}>
						{#if p.destaque}<span class="tag-plano">Mais escolhido</span>{/if}
						<h3>{p.nome}</h3>
						<div class="preco">{p.mes}<span>/mês</span></div>
						<div class="preco-ano">ou {p.ano} por ano, com dois meses livres</div>
						<p class="plano-para">{p.para}</p>
						<ul>
							{#each p.itens as it (it)}<li>{it}</li>{/each}
						</ul>
						<a class="btn btn-block" href="/login?mode=signup">Começar agora</a>
					</article>
				{/each}
			</div>
		{:else}
			<div class="args">
				{#each ARG_CLINICA as a (a.t)}
					<article class="arg">
						<h3>{a.t}</h3>
						<p>{a.d}</p>
					</article>
				{/each}
			</div>

			<div class="planos planos-um">
				<article class="plano destaque">
					<h3>Institucional</h3>
					<div class="preco">R$ 499,90<span>a partir de · /mês</span></div>
					<p class="plano-para">
						Para clínicas de fisioterapia, estúdios de pilates e academias com mais de um
						profissional atendendo.
					</p>
					<ul>
						<li>Múltiplos profissionais na mesma conta</li>
						<li>Até 100 treinos gerados por mês</li>
						<li>Relatório consolidado dos alunos da equipe</li>
						<li>Onboarding dedicado</li>
						<li>Contrato e faturamento</li>
					</ul>
					<a
						class="btn btn-block"
						href="https://wa.me/553591481514?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20plano%20Institucional%20do%20PreceptorFISIC."
					>
						Falar com o time
					</a>
				</article>
			</div>
		{/if}
	</section>

	<section class="bloco alt">
		<div class="sec-head">
			<div class="eyebrow">Confiança</div>
			<h2>Dado de saúde tratado como dado de saúde</h2>
		</div>
		<div class="args">
			<article class="arg">
				<h3>Servidores no Brasil</h3>
				<p>A base fica em território nacional, em conformidade com a LGPD.</p>
			</article>
			<article class="arg">
				<h3>Acesso isolado por conta</h3>
				<p>Cada profissional enxerga apenas os próprios alunos. O link do aluno é individual e assinado.</p>
			</article>
			<article class="arg">
				<h3>Trilha de auditoria</h3>
				<p>Toda geração fica registrada, com o que foi consultado e o que foi alterado depois.</p>
			</article>
		</div>
	</section>

	<section class="fim">
		<h2>Cadastre o primeiro aluno hoje</h2>
		<p>O primeiro plano sai em menos de um minuto, com as restrições clínicas já apontadas.</p>
		<div class="fim-acoes">
			<a class="btn btn-lg" href="/login?mode=signup">Começar agora</a>
			<!-- Mesmo WhatsApp da landing page, com mensagem já preenchida. -->
			<a
				class="btn btn-ghost btn-lg"
				href="https://wa.me/553591481514?text=Ol%C3%A1%21%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20PreceptorFISIC."
			>
				Tirar uma dúvida
			</a>
		</div>
	</section>

	<footer class="ap-foot">
		<BrandMark size={22} />
		<span>PreceptorFISIC · Prescrição clínica validada</span>
		<a href="/legal/privacidade">Privacidade</a>
		<a href="/legal/termos">Termos</a>
	</footer>
</div>

<style>
	/* Superfície de marca: navy fixo e violeta, como o guia. Não acompanha o
	   tema claro do app, porque é peça de divulgação. */
	.ap {
		--navy: #0a0f1e;
		--navy-2: #131a2e;
		--navy-3: #1a2238;
		--line: #252d47;
		--ink-0: #e8ecf5;
		--ink-1: #9aa4bd;
		--ink-2: #6b7391;
		--violet: #8b6bff;
		--violet-light: #b9a6ff;

		background: var(--navy);
		background-image: radial-gradient(var(--line) 1.1px, transparent 1.1px);
		background-size: 22px 22px;
		color: var(--ink-0);
		min-height: 100vh;
		font: 400 16px/1.6 var(--font-sans);
	}

	.ap-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px clamp(18px, 5vw, 56px);
		border-bottom: 1px solid var(--line);
		position: sticky;
		top: 0;
		background: rgba(10, 15, 30, 0.92);
		backdrop-filter: blur(12px);
		z-index: 10;
	}
	.ap-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: var(--ink-0);
	}
	.wm { font: 500 17px var(--font-sans); letter-spacing: -0.01em; }
	.wm-a { font-weight: 400; }
	.wm-b { font-weight: 700; }

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--violet);
		color: var(--navy);
		font: 600 15px var(--font-sans);
		padding: 13px 26px;
		border-radius: 999px;
		text-decoration: none;
		transition: background 160ms ease;
	}
	.btn:hover { background: var(--violet-light); }
	.btn-sm { font-size: 13.5px; padding: 9px 18px; }
	.btn-lg { font-size: 16px; padding: 15px 32px; }
	.btn-block { display: flex; width: 100%; margin-top: 20px; }
	.btn-ghost {
		background: transparent;
		color: var(--ink-0);
		border: 1px solid var(--line);
	}
	.btn-ghost:hover { background: var(--navy-2); }

	.eyebrow {
		font: 600 13px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--violet);
		margin-bottom: 14px;
	}

	.hero {
		max-width: 1080px;
		margin: 0 auto;
		padding: clamp(56px, 9vw, 104px) clamp(18px, 5vw, 56px) clamp(40px, 6vw, 72px);
	}
	.hero h1 {
		font: 600 clamp(32px, 5.2vw, 56px)/1.1 var(--font-sans);
		letter-spacing: -0.03em;
		margin: 0 0 22px;
		max-width: 17ch;
		text-wrap: balance;
	}
	.hero h1 em { color: var(--violet-light); font-style: italic; font-weight: 500; }
	.lead {
		font: 400 clamp(16px, 1.9vw, 19px)/1.6 var(--font-sans);
		color: var(--ink-1);
		max-width: 62ch;
		margin: 0 0 28px;
	}
	.hero-marks {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 26px;
		font: 500 12.5px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ink-2);
	}

	.bloco {
		max-width: 1080px;
		margin: 0 auto;
		padding: clamp(56px, 8vw, 88px) clamp(18px, 5vw, 56px);
	}
	.bloco.alt {
		max-width: none;
		background: var(--navy-2);
		border-block: 1px solid var(--line);
	}
	.bloco.alt > * { max-width: 1080px; margin-inline: auto; }

	.sec-head { margin-bottom: 40px; max-width: 60ch; }
	.sec-head h2 {
		font: 600 clamp(26px, 3.4vw, 38px)/1.15 var(--font-sans);
		letter-spacing: -0.025em;
		margin: 0 0 12px;
		text-wrap: balance;
	}
	.sec-head p { color: var(--ink-1); margin: 0; font-size: 16.5px; }

	.mods {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(268px, 1fr));
		gap: 14px;
	}
	.mod {
		background: var(--navy-2);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 22px;
	}
	.mod h3 {
		font: 600 16.5px var(--font-sans);
		color: var(--violet-light);
		margin: 0 0 8px;
		letter-spacing: -0.01em;
	}
	.mod p { margin: 0; color: var(--ink-1); font-size: 14.8px; line-height: 1.58; }

	.passos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 20px;
	}
	.passo { border-top: 2px solid var(--violet); padding-top: 18px; }
	.passo-n {
		font: 500 12px var(--font-mono);
		color: var(--violet);
		letter-spacing: 0.1em;
	}
	.passo h3 { font: 600 18px var(--font-sans); margin: 8px 0 8px; letter-spacing: -0.015em; }
	.passo p { margin: 0; color: var(--ink-1); font-size: 15px; line-height: 1.58; }

	.switch {
		display: inline-flex;
		gap: 4px;
		padding: 4px;
		background: var(--navy-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		margin-bottom: 36px;
		flex-wrap: wrap;
	}
	.switch button {
		border: 0;
		background: transparent;
		color: var(--ink-1);
		font: 500 14.5px var(--font-sans);
		padding: 11px 22px;
		border-radius: 999px;
		cursor: pointer;
		transition: background 160ms ease, color 160ms ease;
	}
	.switch button:hover { color: var(--ink-0); }
	.switch button.on { background: var(--violet); color: var(--navy); font-weight: 600; }
	.switch button:focus-visible { outline: 2px solid var(--violet-light); outline-offset: 2px; }

	.args {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 16px;
		margin-bottom: 40px;
	}
	.arg h3 {
		font: 600 17px var(--font-sans);
		margin: 0 0 8px;
		color: var(--ink-0);
		letter-spacing: -0.015em;
	}
	.arg p { margin: 0; color: var(--ink-1); font-size: 15px; line-height: 1.6; }

	.planos {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
		gap: 16px;
		max-width: 760px;
	}
	.planos-um { max-width: 420px; }
	.plano {
		background: var(--navy-2);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 26px;
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.plano.destaque { border-color: var(--violet); }
	.tag-plano {
		position: absolute;
		top: -10px;
		left: 26px;
		background: var(--violet);
		color: var(--navy);
		font: 600 10.5px var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 4px 11px;
		border-radius: 999px;
	}
	.plano h3 { font: 600 19px var(--font-sans); margin: 0 0 12px; }
	.preco { font: 600 34px var(--font-sans); letter-spacing: -0.03em; }
	.preco span {
		font: 500 12.5px var(--font-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-left: 8px;
	}
	.preco-ano { font: 400 13.5px var(--font-sans); color: var(--ink-2); margin-top: 6px; }
	.plano-para { color: var(--ink-1); font-size: 14.8px; margin: 14px 0 16px; }
	.plano ul { list-style: none; margin: 0; padding: 0; flex: 1; }
	.plano li {
		color: var(--ink-1);
		font-size: 14.8px;
		padding: 7px 0 7px 22px;
		position: relative;
		line-height: 1.5;
	}
	.plano li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--violet);
		font-weight: 700;
	}

	.fim {
		max-width: 1080px;
		margin: 0 auto;
		padding: clamp(64px, 9vw, 104px) clamp(18px, 5vw, 56px);
		text-align: center;
	}
	.fim h2 {
		font: 600 clamp(28px, 4.2vw, 44px)/1.15 var(--font-sans);
		letter-spacing: -0.028em;
		margin: 0 0 14px;
		text-wrap: balance;
	}
	.fim p { color: var(--ink-1); margin: 0 0 30px; font-size: 17px; }
	.fim-acoes { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

	.ap-foot {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 26px clamp(18px, 5vw, 56px);
		border-top: 1px solid var(--line);
		font: 500 12.5px var(--font-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.ap-foot a { color: var(--ink-2); text-decoration: none; }
	.ap-foot a:hover { color: var(--violet-light); }
	.ap-foot span { flex: 1; min-width: 200px; }

	@media (max-width: 560px) {
		.switch { display: grid; grid-template-columns: 1fr; border-radius: 14px; }
		.switch button { border-radius: 10px; }
		.btn-lg { width: 100%; }
	}
</style>
