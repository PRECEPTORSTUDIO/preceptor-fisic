<script lang="ts">
	import { BrandMark } from '$lib/components/ui';

	const SECOES = [
		{ id: 's1', t: 'O que a plataforma faz' },
		{ id: 's2', t: 'Primeiro acesso e perfil' },
		{ id: 's3', t: 'Painel inicial' },
		{ id: 's4', t: 'Cadastrar um aluno' },
		{ id: 's5', t: 'Avaliação física' },
		{ id: 's6', t: 'Gerar o plano' },
		{ id: 's7', t: 'Validação clínica e restrições' },
		{ id: 's8', t: 'Revisar e ajustar' },
		{ id: 's9', t: 'Publicar para o aluno' },
		{ id: 's10', t: 'O aplicativo do aluno' },
		{ id: 's11', t: 'Catálogo de exercícios' },
		{ id: 's12', t: 'Mensagens e agenda' },
		{ id: 's13', t: 'Assinatura e acesso' },
		{ id: 's14', t: 'Segurança e privacidade' },
		{ id: 's15', t: 'Suporte' }
	];
</script>

<svelte:head>
	<title>Guia de uso · PreceptorFISIC</title>
</svelte:head>

<div class="guia">
	<header class="guia-head">
		<BrandMark size={40} />
		<div>
			<h1><span class="wm-a">Preceptor</span><span class="wm-b">FISIC</span></h1>
			<p class="guia-sub">Manual de uso para profissionais CREF e CREFITO</p>
		</div>
	</header>

	<div class="guia-grid">
		<nav class="guia-toc" aria-label="Índice">
			<div class="toc-label">Neste guia</div>
			<ol>
				{#each SECOES as s (s.id)}
					<li><a href="#{s.id}">{s.t}</a></li>
				{/each}
			</ol>
		</nav>

		<main class="guia-main">
			<p class="lead">
				O PreceptorFISIC prescreve treino para populações especiais com fundamento em diretrizes
				clínicas e validação automática antes de o plano chegar ao aluno. Este guia mostra como
				operar cada parte da plataforma, do cadastro do primeiro aluno ao acompanhamento da
				aderência.
			</p>

			<section id="s1">
				<div class="eyebrow">Visão geral</div>
				<h2>O que a plataforma faz</h2>
				<p>
					O trabalho na plataforma segue sempre a mesma linha: você cadastra o aluno com o
					histórico clínico dele, gera um plano de treino fundamentado em diretrizes reconhecidas
					(ACSM, AHA, OMS, ESSA), revisa a prescrição, corrige o que quiser e publica para o aluno
					acompanhar pelo celular. Entre a geração e a publicação, o plano passa por uma checagem
					clínica automática.
				</p>
				<p>A plataforma tem duas frentes:</p>
				<ul class="plain">
					<li>
						<strong>Do seu lado</strong>, no computador ou no celular, ficam o cadastro, a geração, a
						revisão e o acompanhamento de cada aluno.
					</li>
					<li>
						<strong>Do lado do aluno</strong> fica um aplicativo enxuto, aberto por link, com o treino
						do dia e o registro de cada série.
					</li>
				</ul>
				<div class="callout dica">
					<span class="ic">›</span>
					<p>
						<span class="lbl">Para quem é</span>Personal trainers, fisioterapeutas e clínicas que
						prescrevem exercício para pessoas com hipertensão, diabetes, cardiopatia, DPOC, gestação,
						pós-cirúrgico e outras condições que exigem cuidado na dose.
					</p>
				</div>
			</section>

			<section id="s2">
				<div class="eyebrow">Configuração</div>
				<h2>Primeiro acesso e perfil</h2>
				<p>
					No primeiro acesso você informa nome completo, registro profissional (CREF, CREFITO ou
					CRM) e a especialidade. Esses três dados formam sua identidade profissional dentro da
					plataforma e aparecem para o aluno.
				</p>
				<p>
					Para revisar ou corrigir depois, abra <span class="path">Configurações</span> no menu.
					Ali ficam a conta, o e-mail, o registro e a especialidade que o aluno enxerga.
				</p>

				<h3>Tema claro e escuro</h3>
				<p>
					A plataforma abre no tema do seu aparelho e você troca quando quiser pelo botão de sol e
					lua, no menu lateral do computador ou no topo do celular. A escolha fica guardada e vale
					para os próximos acessos. O aplicativo do aluno tem o mesmo botão, e a escolha dele é
					independente da sua.
				</p>
				<div class="callout cuidado">
					<span class="ic">!</span>
					<p>
						<span class="lbl">Confira o registro</span>O número do CREF ou CREFITO sustenta a
						responsabilidade técnica da prescrição e fica visível para o aluno. Confira antes de
						publicar o primeiro plano.
					</p>
				</div>
			</section>

			<section id="s3">
				<div class="eyebrow">Rotina</div>
				<h2>Painel inicial</h2>
				<p>
					A <span class="path">Visão geral</span> é a primeira tela depois do login. Ela funciona
					como a sua fila de trabalho do dia. Reúne os alunos que precisam de atenção e já os
					ordena pelo que está parado:
				</p>
				<ul class="plain">
					<li>Quem ainda não treinou</li>
					<li>Quem sumiu há vários dias</li>
					<li>Quem está sem plano ativo</li>
				</ul>
				<p>Cada linha leva direto para a ficha do aluno, então você resolve sem procurar.</p>
			</section>

			<section id="s4">
				<div class="eyebrow">Alunos</div>
				<h2>Cadastrar um aluno</h2>
				<p>Abra <span class="path">Alunos</span> e clique em <strong>Novo aluno</strong>. O cadastro tem duas partes: os dados de contato e o perfil clínico.</p>

				<h3>Perfil clínico</h3>
				<p>É a base de tudo que a plataforma gera depois. Preencha com cuidado:</p>
				<ul class="plain">
					<li><strong>Diagnósticos</strong> declarados, separados por vírgula</li>
					<li><strong>Medicações</strong> em uso</li>
					<li><strong>Lesões e limitações</strong> que restringem movimento</li>
					<li><strong>Nível de experiência</strong> com treino</li>
					<li><strong>Objetivos</strong>, um ou mais</li>
					<li><strong>Equipamento disponível</strong>, que define os exercícios possíveis</li>
				</ul>

				<h3>Você preenche ou o aluno preenche</h3>
				<p>Há dois caminhos:</p>
				<ol class="steps">
					<li>Você preenche tudo na hora, com o aluno na frente ou a partir de uma avaliação anterior.</li>
					<li>
						Você envia um link para o aluno completar o cadastro pelo celular. Ele recebe o link por
						e-mail, responde os dados e o cadastro chega pronto do seu lado. O aluno não cria conta.
					</li>
				</ol>
				<div class="callout clinico">
					<span class="ic">▲</span>
					<p>
						<span class="lbl">Atenção clínica</span>O que você não informar aqui, a plataforma não
						considera. Uma medicação ou uma lesão omitida no cadastro não entra na geração nem na
						validação. O cadastro completo é a primeira camada de segurança do aluno.
					</p>
				</div>
			</section>

			<section id="s5">
				<div class="eyebrow">Alunos</div>
				<h2>Avaliação física</h2>
				<p>
					Na ficha do aluno você registra uma <strong>Nova avaliação</strong>. Ela guarda:
				</p>
				<ul class="plain">
					<li>Antropometria (peso e altura, com o IMC calculado na hora)</li>
					<li>Composição corporal por bioimpedância, quando houver</li>
					<li>Dados cardiovasculares</li>
					<li>Observações clínicas</li>
				</ul>
				<p>
					A avaliação fica no histórico do aluno e serve de referência para as próximas. Registre
					uma no início do acompanhamento e repita nos retornos, para medir progresso com número.
				</p>
			</section>

			<section id="s6">
				<div class="eyebrow">Prescrição</div>
				<h2>Gerar o plano</h2>
				<p>
					Com o cadastro pronto, abra a ficha do aluno e use <strong>Gerar treino</strong>. Antes
					de gerar, a plataforma mostra o contexto que vai usar, para você conferir e completar:
				</p>
				<ul class="plain">
					<li>Condições médicas e limitações do aluno</li>
					<li>Medicações em uso</li>
					<li>Equipamento disponível</li>
					<li>Observações profissionais, um campo livre para guiar a geração</li>
				</ul>
				<p>
					A geração leva de 15 a 30 segundos e você vê o plano surgindo ao vivo. Cada recomendação
					consulta diretrizes reconhecidas e cita a fonte, com página e organização.
				</p>
				<div class="callout dica">
					<span class="ic">›</span>
					<p>
						<span class="lbl">Dica</span>Quanto mais específica a observação profissional, mais
						próximo do que você faria na mão. Um pedido como "priorizar cadeia posterior, evitar
						impacto no joelho" muda o plano inteiro.
					</p>
				</div>
			</section>

			<section id="s7">
				<div class="eyebrow">Segurança</div>
				<h2>Validação clínica e restrições</h2>
				<p>
					Todo plano gerado passa por uma bateria de regras clínicas antes de você publicar. Elas
					detectam contraindicações ligadas a condições como lesão de ligamento, hipertensão,
					cardiopatia, gestação e DPOC. O resultado aparece como uma lista de restrições, em três
					níveis:
				</p>
				<ul class="plain niveis">
					<li><strong class="n-red">Vermelho</strong> contraindicação séria. Bloqueia a publicação até você tratar.</li>
					<li><strong class="n-amber">Amarelo</strong> cuidado a observar, sem bloqueio.</li>
					<li><strong class="n-green">Verde</strong> item aprovado.</li>
				</ul>
				<p>
					Cada restrição explica o motivo e cita a diretriz por trás. Uma restrição vermelha traz o
					botão <strong>Assumir responsabilidade e liberar</strong>. Ao usá-lo, você registra que
					avaliou o caso e assume a responsabilidade técnica pela liberação, e só então o plano
					pode ir para o aluno.
				</p>
				<div class="callout clinico">
					<span class="ic">▲</span>
					<p>
						<span class="lbl">Atenção clínica</span>A validação é uma rede de apoio, não substitui o
						seu julgamento. Liberar uma restrição vermelha é uma decisão clínica sua, registrada em
						seu nome. Leia o motivo antes de assumir.
					</p>
				</div>
			</section>

			<section id="s8">
				<div class="eyebrow">Prescrição</div>
				<h2>Revisar e ajustar</h2>
				<p>
					O plano abre organizado por sessão, e cada sessão em três blocos: aquecimento, parte
					principal e volta à calma. Em cada exercício você tem as ações da linha:
				</p>
				<ul class="plain">
					<li><strong>Vídeo</strong>, abre a demonstração do movimento</li>
					<li><strong>Trocar</strong>, substitui o exercício por outro do catálogo</li>
					<li><strong>Editar</strong>, ajusta séries, repetições, descanso e intensidade</li>
					<li><strong>Excluir</strong>, remove o exercício da sessão</li>
				</ul>

				<h3>Mudar a ordem dos exercícios</h3>
				<p>
					As setas ao lado do número da posição movem o exercício uma casa para cima ou para baixo.
					O movimento acontece dentro do próprio bloco, então um exercício da parte principal nunca
					troca de lugar com um de aquecimento. Reordenar não dispara a validação de novo, porque a
					ordem não muda contraindicação.
				</p>

				<h3>Ver as fontes e revalidar</h3>
				<p>
					O painel de fontes mostra em que diretriz cada recomendação se apoia. Depois de qualquer
					ajuste que mexa nos exercícios, use <strong>Re-validar</strong> para rodar a checagem
					clínica sobre a versão nova.
				</p>
			</section>

			<section id="s9">
				<div class="eyebrow">Prescrição</div>
				<h2>Publicar para o aluno</h2>
				<p>
					Com o plano revisado e sem restrição vermelha pendente, use
					<strong>Publicar para o aluno</strong>. O aluno recebe um link de acesso por e-mail e
					abre o treino direto no celular. Ele não cria conta, não instala aplicativo e não precisa
					de senha. O link é o acesso dele.
				</p>
				<div class="callout dica">
					<span class="ic">›</span>
					<p>
						<span class="lbl">Dica</span>Antes de publicar, gere o PDF em
						<strong>Imprimir / PDF</strong> se quiser uma cópia do plano para arquivo ou para
						entregar impresso.
					</p>
				</div>
			</section>

			<section id="s10">
				<div class="eyebrow">Aluno</div>
				<h2>O aplicativo do aluno</h2>
				<p>
					Do lado do aluno, o aplicativo abre no treino do dia. Ele vê a sessão prevista, os
					exercícios, o tempo estimado e um resumo das restrições clínicas que precisa respeitar.
				</p>
				<p>
					A cada série, o aluno registra o peso usado e a percepção de esforço (PSE). Esse registro
					alimenta o histórico e a sequência de dias treinados, que você acompanha em tempo real.
					Quando o aluno conclui o treino, o progresso aparece do seu lado na hora.
				</p>
				<p>
					O aplicativo funciona no navegador do celular e pode ser fixado na tela inicial, sem loja
					de aplicativos.
				</p>
			</section>

			<section id="s11">
				<div class="eyebrow">Biblioteca</div>
				<h2>Catálogo de exercícios</h2>
				<p>
					O <span class="path">Exercícios</span> reúne o catálogo com mais de mil exercícios, cada
					um com vídeo de execução, indexados por grupo muscular. Use a busca e os filtros de nível
					para encontrar o movimento certo.
				</p>
				<h3>Meus exercícios</h3>
				<p>
					Em <strong>Meus exercícios</strong> você cria e mantém os seus próprios movimentos, além
					do catálogo padrão. Eles ficam disponíveis na hora de trocar ou adicionar exercícios em
					um plano.
				</p>
			</section>

			<section id="s12">
				<div class="eyebrow">Acompanhamento</div>
				<h2>Mensagens e agenda</h2>
				<h3>Mensagens</h3>
				<p>
					Em <span class="path">Mensagens</span> ficam as conversas com os alunos. Ao abrir uma
					conversa, você tem o contexto do aluno ao lado e um atalho para a ficha completa, então
					responde sem perder de vista o histórico clínico.
				</p>
				<h3>Agenda</h3>
				<p>
					A <span class="path">Agenda</span> organiza suas sessões por semana. Em
					<strong>Nova sessão</strong> você define data, horário e duração, e registra os detalhes
					do encontro. Use para reavaliações, retornos e acompanhamentos presenciais.
				</p>
			</section>

			<section id="s13">
				<div class="eyebrow">Conta</div>
				<h2>Assinatura e acesso</h2>
				<p>
					O acesso à plataforma depende de assinatura ativa. Os planos se diferenciam pelo limite
					de alunos ativos e pelo número de treinos gerados por mês:
				</p>
				<ul class="plain">
					<li>
						<strong>Essencial</strong>, até 60 alunos ativos e 20 treinos gerados por mês
					</li>
					<li><strong>Pro</strong>, até 150 alunos ativos e 50 treinos gerados por mês</li>
					<li>
						<strong>Institucional</strong>, para equipes, com múltiplos profissionais e 100 treinos
						gerados por mês
					</li>
				</ul>
				<p>
					Cada plano tem cobrança mensal ou anual. No ciclo anual você paga dez meses e usa doze.
					A cobrança é feita por link de pagamento e o acesso é liberado assim que o pagamento é
					confirmado, sem espera manual.
				</p>
				<p>
					Se o pagamento ficar pendente, o acesso é interrompido até a regularização. Os dados dos
					seus alunos continuam salvos e voltam assim que a assinatura for retomada.
				</p>
				<div class="callout dica">
					<span class="ic">›</span>
					<p>
						<span class="lbl">Onde acompanhar</span>O plano contratado, as faturas e a troca de
						plano ficam em <span class="path">Configurações</span>, na área de plano e cobrança.
					</p>
				</div>
				<div class="callout dica">
					<span class="ic">›</span>
					<p>
						<span class="lbl">Administradores</span>Contas com perfil de administrador têm também o
						<span class="path">CRM</span>, que organiza o funil de contatos, da primeira visita ao
						cadastro e à assinatura.
					</p>
				</div>
			</section>

			<section id="s14">
				<div class="eyebrow">Confiança</div>
				<h2>Segurança e privacidade</h2>
				<p>
					Os dados ficam em servidores no Brasil, em conformidade com a LGPD. O histórico clínico
					do aluno é dado sensível e recebe tratamento próprio: acesso restrito ao profissional
					responsável, isolamento por conta e trilha de auditoria das gerações.
				</p>
				<p>
					O link de acesso do aluno é assinado e individual. Cada profissional enxerga apenas os
					próprios alunos. A base legal, os prazos de retenção e os direitos do titular estão
					descritos na Política de Privacidade da plataforma.
				</p>
			</section>

			<section id="s15">
				<div class="eyebrow">Ajuda</div>
				<h2>Suporte</h2>
				<p>
					O <span class="path">Feedback</span>, no menu, é o canal direto com quem constrói a
					plataforma. Escolha a categoria que descreve o caso, bug, sugestão, dúvida, elogio ou
					outro, e escreva o que aconteceu. O campo <strong>Onde aconteceu</strong> é opcional,
					mas preencher com a tela ajuda bastante, algo como "tela de gerar plano" já basta.
				</p>
				<p>
					Ao relatar um problema, diga qual aluno e qual plano estavam envolvidos e o que você
					esperava que acontecesse. Isso encurta bastante o caminho até a correção.
				</p>
			</section>

			<div class="guia-foot">PreceptorFISIC · Manual de uso · Prescrição clínica validada</div>
		</main>
	</div>
</div>

<style>
	/* Navy fixo, como a landing page: o guia é uma superfície de marca e não
	   acompanha o tema claro do app. Paleta e proporções do manual de marca. */
	.guia {
		--navy: #0a0f1e;
		--navy-2: #131a2e;
		--navy-3: #1a2238;
		--line: #252d47;
		--ink-0: #e8ecf5;
		--ink-1: #9aa4bd;
		--ink-2: #6b7391;
		--violet: #8b6bff;
		--violet-light: #b9a6ff;
		--danger: #f87171;
		--amber: #fbbf24;
		--green: #34d399;

		background: var(--navy);
		background-image: radial-gradient(var(--line) 1.1px, transparent 1.1px);
		background-size: 22px 22px;
		color: var(--ink-0);
		/* .pf-main não tem padding próprio: o guia preenche toda a área de
		   conteúdo e cria o respiro por dentro. Sem margem negativa. */
		flex: 1;
		min-height: 100%;
		padding: 4px clamp(20px, 4vw, 44px) 80px;
	}
	@media (max-width: 1023px) {
		.guia { padding: 4px 16px 64px; }
	}

	.guia-head {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 40px 0 26px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 40px;
	}
	.guia-head h1 { font: 600 22px var(--font-sans); margin: 0; letter-spacing: -0.01em; color: var(--ink-0); }
	.guia-head .wm-a { font-weight: 400; }
	.guia-head .wm-b { font-weight: 700; }
	.guia-sub { margin: 3px 0 0; font: 500 13px var(--font-mono); color: var(--ink-2); }

	.guia-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 52px; align-items: start; }

	.guia-toc { position: sticky; top: 20px; }
	.guia-toc .toc-label {
		font: 500 10.5px var(--font-mono); text-transform: uppercase; letter-spacing: 0.16em;
		color: var(--ink-2); margin-bottom: 12px;
	}
	.guia-toc ol { list-style: none; margin: 0; padding: 0; counter-reset: toc; }
	.guia-toc li { counter-increment: toc; }
	.guia-toc a {
		display: flex; gap: 10px; padding: 5px 0; color: var(--ink-1); text-decoration: none;
		font: 400 13.5px/1.35 var(--font-sans); border-radius: 6px; transition: color 0.15s;
	}
	.guia-toc a::before {
		content: counter(toc, decimal-leading-zero);
		font: 500 11px var(--font-mono); color: var(--ink-2); padding-top: 2px; min-width: 20px;
	}
	.guia-toc a:hover, .guia-toc a:focus-visible { color: var(--violet-light); outline: none; }
	.guia-toc a:hover::before, .guia-toc a:focus-visible::before { color: var(--violet-light); }

	.guia-main { min-width: 0; max-width: 68ch; }
	.lead { font: 400 18px/1.6 var(--font-sans); color: var(--ink-1); margin: 0 0 8px; }

	.guia-main section {
		padding-top: 24px; margin-top: 40px; border-top: 1px solid var(--line); counter-increment: sec;
	}
	.guia-main section:first-of-type { border-top: 0; margin-top: 24px; padding-top: 0; }
	.eyebrow {
		font: 500 11px var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em;
		color: var(--violet); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
	}
	.eyebrow::before { content: counter(sec, decimal-leading-zero); color: var(--ink-2); }
	.guia-main h2 { font: 600 25px/1.2 var(--font-sans); margin: 0 0 14px; letter-spacing: -0.02em; color: var(--ink-0); text-wrap: balance; }
	.guia-main h3 { font: 600 16px var(--font-sans); margin: 26px 0 8px; color: var(--ink-0); }
	.guia-main p { margin: 0 0 14px; color: var(--ink-1); font: 400 15.5px/1.62 var(--font-sans); }
	.guia-main strong { color: var(--ink-0); font-weight: 600; }

	ol.steps { margin: 4px 0 16px; padding: 0; list-style: none; counter-reset: step; }
	ol.steps li { counter-increment: step; position: relative; padding: 0 0 12px 38px; color: var(--ink-1); font: 400 15.5px/1.55 var(--font-sans); }
	ol.steps li::before {
		content: counter(step); position: absolute; left: 0; top: 0; width: 24px; height: 24px;
		border-radius: 7px; background: var(--navy-2); border: 1px solid var(--line);
		color: var(--violet-light); font: 500 12px var(--font-mono);
		display: flex; align-items: center; justify-content: center;
	}
	ul.plain { margin: 4px 0 16px; padding-left: 20px; color: var(--ink-1); }
	ul.plain li { margin-bottom: 6px; font: 400 15.5px/1.55 var(--font-sans); }
	ul.plain li::marker { color: var(--violet); }
	ul.niveis { list-style: none; padding-left: 0; }
	ul.niveis li { padding-left: 0; }
	.n-red { color: var(--danger); } .n-amber { color: var(--amber); } .n-green { color: var(--green); }

	.callout {
		display: flex; gap: 12px; padding: 14px 16px; border-radius: 10px; margin: 4px 0 18px;
		border: 1px solid var(--line); background: var(--navy-2);
	}
	.callout .ic { font: 700 15px var(--font-mono); flex-shrink: 0; line-height: 1.5; }
	.callout p { margin: 0; color: var(--ink-1); font: 400 14.5px/1.55 var(--font-sans); }
	.callout .lbl { display: block; font: 500 10.5px var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
	.callout.clinico { background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.32); }
	.callout.clinico .ic, .callout.clinico .lbl { color: var(--danger); }
	.callout.cuidado { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.32); }
	.callout.cuidado .ic, .callout.cuidado .lbl { color: var(--amber); }
	.callout.dica { background: rgba(139, 107, 255, 0.1); border-color: rgba(139, 107, 255, 0.32); }
	.callout.dica .ic, .callout.dica .lbl { color: var(--violet-light); }

	.path {
		font: 500 12.5px var(--font-mono); background: var(--navy-3); border: 1px solid var(--line);
		border-radius: 6px; padding: 2px 7px; color: var(--ink-0); white-space: nowrap;
	}
	.guia-foot {
		margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line);
		font: 500 12px var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-2);
	}

	@media (max-width: 860px) {
		.guia-grid { grid-template-columns: 1fr; gap: 0; }
		.guia-toc { position: static; margin-bottom: 28px; padding: 18px; background: var(--navy-2); border: 1px solid var(--line); border-radius: 12px; }
		.guia-toc ol { columns: 2; column-gap: 20px; }
		.guia-main { max-width: 100%; }
	}
</style>
