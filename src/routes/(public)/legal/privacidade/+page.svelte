<svelte:head>
	<title>Política de Privacidade · Preceptor Fisic</title>
	<meta name="description" content="Política de Privacidade e tratamento de dados — LGPD." />
</svelte:head>

<h1>Política de Privacidade</h1>
<div class="legal-meta">
	Última atualização: 7 de maio de 2026 · Conformidade Lei 13.709/2018 (LGPD)
</div>

<p>
	A privacidade dos seus dados é prioridade. Este documento descreve quais dados coletamos,
	por que, com quem compartilhamos e quais são seus direitos sob a LGPD.
</p>

<h2>1. Quem somos</h2>
<p>
	<strong>Preceptor Fisic</strong> — controlador dos dados pessoais para fins de uso da
	plataforma. Atendemos a Autoridade Nacional de Proteção de Dados (ANPD) e nomeamos
	encarregado conforme art. 41 da LGPD.
</p>
<ul>
	<li>Encarregado (DPO): <a href="mailto:dpo@preceptorfisic.com">dpo@preceptorfisic.com</a></li>
	<li>Razão social: a definir</li>
</ul>

<h2>2. Dados que coletamos</h2>

<h3>2.1. Profissional</h3>
<ul>
	<li>Identificação: nome completo, email, CREF/CREFITO/CRM</li>
	<li>Especialidade declarada</li>
	<li>Senha (armazenada com hash bcrypt via Supabase Auth)</li>
	<li>Logs de acesso (IP, user-agent, timestamp) — finalidade: segurança</li>
</ul>

<h3>2.2. Aluno</h3>
<p>
	Coletamos <strong>dados sensíveis de saúde</strong> (art. 11 LGPD) para a finalidade
	clínica de prescrição de exercício:
</p>
<ul>
	<li>Identificação: nome, data de nascimento, sexo, contato</li>
	<li>Antropometria: peso, altura, IMC</li>
	<li>Diagnósticos clínicos declarados</li>
	<li>Medicamentos em uso</li>
	<li>Histórico de lesões/limitações</li>
	<li>Risco cardiovascular e nível de experiência</li>
	<li>Objetivos e preferências de treino</li>
	<li>Sessões realizadas, aderência, progresso</li>
</ul>
<p>
	<strong>Base legal</strong>: consentimento expresso (art. 11, I) coletado pelo profissional
	cadastrado, registrado em <code>students.consent_accepted_at</code>.
</p>

<h3>2.3. Geração por IA</h3>
<p>
	Para gerar planos personalizados, o resumo dos dados clínicos do aluno é enviado ao Google
	Gemini (modelo 2.5 Flash/Pro). O Google trata esses dados como <strong>processador</strong>
	conforme nosso DPA com a Google Cloud:
</p>
<ul>
	<li>Não usado para treinar modelos</li>
	<li>Não persistido após processamento</li>
	<li>Servido em região US (Vertex AI) — explicitamente consentido pelo profissional ao usar a função</li>
</ul>
<p>
	Auditoria completa fica em <code>ai_runs</code>: prompt, modelo, tokens, latência. Acesso
	restrito ao próprio profissional e à equipe técnica do Preceptor sob NDA.
</p>

<h2>3. Onde armazenamos</h2>
<ul>
	<li><strong>Banco principal</strong>: Supabase (Postgres) — região <code>sa-east-1</code> (São Paulo, BR)</li>
	<li><strong>Edge / hosting</strong>: Vercel — região <code>gru1</code> (São Paulo, BR)</li>
	<li><strong>Email transacional</strong>: Resend (servidores nos EUA, dados mínimos: nome + email)</li>
	<li><strong>IA</strong>: Google Vertex AI (US) — apenas durante geração, sem persistência</li>
</ul>
<p>
	Transferências internacionais (Resend, Google) são amparadas em
	<strong>Cláusulas Contratuais Padrão (SCCs)</strong> e adequação à LGPD.
</p>

<h2>4. Por quanto tempo</h2>
<ul>
	<li>Dados clínicos ativos: enquanto o aluno estiver vinculado ao profissional</li>
	<li>Após desvínculo: deletados em 30 dias (lógico) e 90 dias (físico/backups)</li>
	<li>Auditoria de prescrição: mantida 5 anos (obrigação clínica do CONFEF/COFFITO)</li>
	<li>Logs de acesso: 6 meses</li>
	<li>Email transacional: 30 dias no provedor (Resend)</li>
</ul>

<h2>5. Com quem compartilhamos</h2>
<p>
	<strong>Não vendemos seus dados.</strong> Compartilhamos apenas com:
</p>
<ul>
	<li>Operadores técnicos: Supabase, Vercel, Resend, Google (todos com DPA)</li>
	<li>Profissional cadastrado: dados do aluno são visíveis ao profissional dele</li>
	<li>Autoridades competentes: mediante ordem judicial ou requisição da ANPD</li>
</ul>

<h2>6. Seus direitos (LGPD art. 18)</h2>
<p>Você tem direito a:</p>
<ul>
	<li><strong>Acesso</strong>: ver todos os dados que temos sobre você</li>
	<li><strong>Correção</strong>: atualizar dados incompletos ou desatualizados</li>
	<li><strong>Anonimização ou bloqueio</strong>: para dados desnecessários ou tratados em desconformidade</li>
	<li><strong>Eliminação</strong>: deletar dados tratados com base em consentimento</li>
	<li><strong>Portabilidade</strong>: receber seus dados em formato estruturado (CSV/JSON)</li>
	<li><strong>Revogação do consentimento</strong>: a qualquer momento</li>
	<li><strong>Informação sobre compartilhamento</strong>: lista atualizada de operadores</li>
</ul>
<p>
	Para exercer qualquer direito, escreva para
	<a href="mailto:dpo@preceptorfisic.com">dpo@preceptorfisic.com</a>. Respondemos em até
	15 dias úteis (art. 19, §1º).
</p>

<h2>7. Cookies e rastreamento</h2>
<p>Usamos:</p>
<ul>
	<li><strong>Cookies de sessão</strong> (auth Supabase) — essenciais, sem consentimento</li>
	<li><strong>Service Worker</strong> (PWA) — cache de assets, sem rastreamento</li>
	<li><strong>Analytics</strong>: Plausible (privacy-first, sem cookies, agregado)</li>
</ul>
<p>Não usamos pixels de redes sociais nem trackers de terceiros invasivos.</p>

<h2>8. Segurança</h2>
<ul>
	<li>TLS 1.3 em todas as conexões (HSTS habilitado)</li>
	<li>Hash bcrypt em senhas (Supabase Auth)</li>
	<li>HMAC-SHA256 em magic-links de aluno</li>
	<li>Row-Level Security (RLS) no Postgres garante isolamento por profissional</li>
	<li>Auditoria de acessos via <code>ai_runs</code> e logs Vercel</li>
	<li>Backup automatizado diário (Supabase, retenção 7 dias no plano atual)</li>
</ul>
<p>
	Em caso de incidente, comunicaremos ANPD e titulares afetados conforme art. 48.
</p>

<h2>9. Crianças e adolescentes</h2>
<p>
	A plataforma <strong>não é destinada a menores de 18 anos</strong> sem consentimento
	específico do responsável legal. Profissionais que atendem menores devem coletar e arquivar
	o termo de consentimento dos pais/responsáveis fora da plataforma.
</p>

<h2>10. Alterações</h2>
<p>
	Mudanças materiais são comunicadas por email com 30 dias de antecedência. A versão atual
	está sempre disponível em <a href="/legal/privacidade">preceptorfisic.com/legal/privacidade</a>.
</p>

<hr />

<p>
	<strong>Encarregado (DPO)</strong>:
	<a href="mailto:dpo@preceptorfisic.com">dpo@preceptorfisic.com</a><br />
	<strong>Reclamação à ANPD</strong>:
	<a href="https://www.gov.br/anpd" target="_blank" rel="noopener">gov.br/anpd</a>
</p>
