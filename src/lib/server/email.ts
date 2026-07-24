/**
 * Email transactional via Resend.
 *
 * Setup:
 *   1. Crie conta em https://resend.com (free tier 100 emails/dia)
 *   2. Verifique seu domínio (ou use onboarding@resend.dev em dev)
 *   3. Crie API key e cole em RESEND_API_KEY no .env.local
 *   4. Configure RESEND_FROM com email verificado (ex: "PreceptorFISIC <noreply@seu-dominio.com>")
 *
 * Sem RESEND_API_KEY: as funções logam e retornam { skipped: true } em vez
 * de falhar — útil em dev/staging sem incomodar com setup.
 */
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { logger } from './logger';
import { signStudentToken } from './aluno-token';
import { APP_TZ } from './tz';

const RESEND_API_KEY = env.RESEND_API_KEY;
const FROM = env.RESEND_FROM ?? 'PreceptorFISIC <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type EmailResult = { sent: boolean; skipped?: boolean; error?: string; id?: string };

async function send(opts: {
	to: string;
	subject: string;
	html: string;
	text?: string;
	tag?: string;
}): Promise<EmailResult> {
	if (!resend) {
		logger.warn(
			{ to: opts.to, subject: opts.subject, tag: opts.tag },
			'email.skipped (RESEND_API_KEY não setada)'
		);
		return { sent: false, skipped: true };
	}

	try {
		const { data, error } = await resend.emails.send({
			from: FROM,
			to: opts.to,
			subject: opts.subject,
			html: opts.html,
			text: opts.text
		});
		if (error) {
			logger.error({ to: opts.to, tag: opts.tag, err: error.message }, 'email.send.failed');
			return { sent: false, error: error.message };
		}
		logger.info({ to: opts.to, tag: opts.tag, id: data?.id }, 'email.sent');
		return { sent: true, id: data?.id };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error({ to: opts.to, tag: opts.tag, err: msg }, 'email.send.exception');
		return { sent: false, error: msg };
	}
}

// Fallback = staging, que é o ambiente que os usuários reais usam. A produção
// antiga (preceptor-fisic.vercel.app) está congelada: se PUBLIC_APP_URL faltar
// em algum ambiente, os magic links dos alunos apontariam pro site morto.
const APP_URL =
	pubEnv.PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://preceptor-fisic-staging.vercel.app';

// Escape de HTML pra TODO dado de usuário interpolado nos templates —
// sem isso, nome de aluno/profissional vira vetor de injeção de HTML
// (phishing enviado pelo nosso domínio verificado no Resend).
function escapeHtml(s: string): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const baseTemplate = (heading: string, body: string, ctaUrl?: string, ctaLabel?: string) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fafafa;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="display:flex;align-items:center;gap:11px;margin-bottom:32px;">
    <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#A78BFA,#6d5fa3);color:#0a0a0a;font:700 16px sans-serif;display:flex;align-items:center;justify-content:center;">P</div>
    <div>
      <div style="font:600 15px sans-serif;color:#fafafa;">PreceptorFISIC</div>
      <div style="font:500 9.5px monospace;color:#4d4d4d;text-transform:uppercase;letter-spacing:0.1em;margin-top:1px;">PRO · v3.2</div>
    </div>
  </div>
  <h1 style="font:500 24px sans-serif;color:#fafafa;letter-spacing:-0.02em;margin:0 0 14px;">${heading}</h1>
  <div style="font:400 15px/1.55 sans-serif;color:#b8b8b8;">${body}</div>
  ${
		ctaUrl && ctaLabel
			? `<div style="margin:28px 0;">
    <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(180deg,#A78BFA,#6d5fa3);color:#0a0a0a;font:600 14px sans-serif;border-radius:999px;text-decoration:none;">${ctaLabel}</a>
  </div>
  <div style="font:400 13px/1.55 sans-serif;color:#7a7a7a;margin-top:14px;">
    Ou copie este link no navegador:<br>
    <a href="${ctaUrl}" style="color:#A78BFA;word-break:break-all;">${ctaUrl}</a>
  </div>`
			: ''
	}
  <div style="margin-top:48px;padding-top:18px;border-top:1px solid #2a2a2a;font:500 10px monospace;color:#4d4d4d;text-transform:uppercase;letter-spacing:0.1em;">
    Conformidade LGPD · Dados na região BR · sa-east-1
  </div>
</div>
</body>
</html>
`;

/**
 * Email pro aluno com o magic-link de acesso ao app dele.
 * Disparado quando profissional cria/atualiza um aluno.
 */
export async function sendStudentMagicLink(opts: {
	to: string;
	studentName: string;
	professionalName: string;
	magicLinkUrl: string;
}): Promise<EmailResult> {
	const firstName = escapeHtml(opts.studentName.split(' ')[0] || 'aluno');
	const professionalName = escapeHtml(opts.professionalName);
	const subject = `${opts.professionalName} liberou seu acesso ao PreceptorFISIC`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;"><strong style="color:#fafafa;">${professionalName}</strong> cadastrou você no PreceptorFISIC — sua plataforma pra acompanhar treinos prescritos.</p>
<p style="margin:0;">Clique no botão abaixo pra abrir seu app no celular. <strong style="color:#fafafa;">Não precisa criar conta nem baixar nada</strong>: o link é seu acesso direto.</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate('Seu acesso liberado.', body, opts.magicLinkUrl, 'Abrir meu treino →'),
		text: `${opts.professionalName} liberou seu acesso ao PreceptorFISIC. Abra: ${opts.magicLinkUrl}`,
		tag: 'student.magic_link'
	});
}

/**
 * Email pro aluno com o link de auto-preenchimento do cadastro.
 * Disparado quando o profissional cria o aluno no modo "enviar link".
 */
export async function sendStudentFillLink(opts: {
	to: string;
	studentName: string;
	professionalName: string;
	fillUrl: string;
}): Promise<EmailResult> {
	const firstName = escapeHtml(opts.studentName.split(' ')[0] || 'aluno');
	const professionalName = escapeHtml(opts.professionalName);
	const subject = `${opts.professionalName} pediu pra você completar seu cadastro`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;"><strong style="color:#fafafa;">${professionalName}</strong> começou seu cadastro no PreceptorFISIC. Pra montar seus treinos sob medida, falta você preencher alguns dados.</p>
<p style="margin:0;">Leva 2 minutos. <strong style="color:#fafafa;">Não precisa criar conta nem baixar nada</strong> — é só clicar.</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate('Complete seu cadastro.', body, opts.fillUrl, 'Preencher meus dados →'),
		text: `${opts.professionalName} pediu pra você completar seu cadastro no PreceptorFISIC. Preencha: ${opts.fillUrl}`,
		tag: 'student.fill_link'
	});
}

/**
 * Boas-vindas pro profissional após signup confirmado.
 */
export async function sendProfessionalWelcome(opts: {
	to: string;
	name: string;
}): Promise<EmailResult> {
	const firstName = escapeHtml(opts.name.split(' ')[0] || 'profissional');
	const subject = 'Bem-vindo(a) ao PreceptorFISIC';
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;">Seu perfil profissional está ativo. Agora você pode prescrever treinos com o PreceptorFISIC, fundamentado em diretrizes ACSM, com validação clínica automática.</p>
<p style="margin:0;">Bora cadastrar o primeiro aluno?</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate(
			'Bem-vindo a bordo.',
			body,
			`${APP_URL}/alunos/novo`,
			'Cadastrar primeiro aluno →'
		),
		tag: 'professional.welcome'
	});
}

/**
 * Notifica aluno sobre agendamento (novo, remarcado ou cancelado).
 */
export async function sendAppointmentNotification(opts: {
	to: string;
	studentName: string;
	professionalName: string;
	startsAt: Date;
	durationMinutes: number;
	type: string;
	label?: string | null;
	studentId: string;
	linkTokenVersion?: number;
	/** 'agendada' (default) | 'remarcada' | 'cancelada' — muda assunto e corpo. */
	variant?: 'agendada' | 'remarcada' | 'cancelada';
}): Promise<EmailResult> {
	const variant = opts.variant ?? 'agendada';
	const firstName = escapeHtml(opts.studentName.split(' ')[0] || 'aluno');
	// timeZone explícito: o server (Vercel) roda em UTC — sem isso o email
	// sairia com o horário deslocado em 3h pro aluno.
	const dateStr = opts.startsAt.toLocaleDateString('pt-BR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		timeZone: APP_TZ
	});
	const timeStr = opts.startsAt.toLocaleTimeString('pt-BR', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: APP_TZ
	});
	const typeLabel: Record<string, string> = {
		treino: 'Sessão de treino',
		avaliacao: 'Avaliação física',
		reabilitacao: 'Reabilitação',
		consulta: 'Consulta'
	};
	const sessionLabel = opts.label ?? typeLabel[opts.type] ?? 'Sessão';
	const safeLabel = escapeHtml(sessionLabel);
	const professionalName = escapeHtml(opts.professionalName);
	const action: Record<typeof variant, { subj: string; lead: string; foot: string }> = {
		agendada: {
			subj: 'agendada',
			lead: 'agendou uma sessão pra você.',
			foot: 'Confira seu treino completo no app.'
		},
		remarcada: {
			subj: 'remarcada',
			lead: 'remarcou sua sessão. Novo horário:',
			foot: 'Se o novo horário não funcionar pra você, avise seu treinador.'
		},
		cancelada: {
			subj: 'cancelada',
			lead: 'cancelou a sessão abaixo.',
			foot: 'Qualquer dúvida, fale com seu treinador pelo app.'
		}
	};
	const a = action[variant];
	const subject = `${sessionLabel} ${a.subj} · ${dateStr.split(',')[0]} ${timeStr}`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;"><strong style="color:#fafafa;">${professionalName}</strong> ${a.lead}</p>
<div style="margin:18px 0;padding:14px 18px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;${variant === 'cancelada' ? 'opacity:.75;' : ''}">
  <div style="font:500 11px monospace;color:#7a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${safeLabel}${variant === 'cancelada' ? ' · CANCELADA' : ''}</div>
  <div style="font:500 16px sans-serif;color:#fafafa;margin-bottom:4px;">${dateStr} · ${timeStr}</div>
  <div style="font:400 13px sans-serif;color:#b8b8b8;">${opts.durationMinutes} minutos</div>
</div>
<p style="margin:0;">${a.foot}</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate(
			`Sessão ${a.subj}.`,
			body,
			// Link do app do aluno é token-gated: sem ?t=, o /a/[id] responde 403.
			`${APP_URL}/a/${opts.studentId}?t=${signStudentToken(opts.studentId, opts.linkTokenVersion ?? 1)}`,
			'Abrir meu app →'
		),
		tag: 'appointment.notification'
	});
}

/**
 * Notifica profissional que o plano gerado pra um aluno está pronto.
 */
/**
 * Alerta interno de venda do EBOOK (cobrança avulsa no Asaas). A entrega é
 * manual: quem recebe este email libera o acesso ao Drive pro comprador.
 * Destinatário via EBOOK_NOTIFY_EMAIL (email do responsável pela liberação).
 */
export async function sendEbookPurchaseAlert(opts: {
	buyerName: string | null;
	buyerEmail: string | null;
	paymentId: string;
	value: number | null;
}): Promise<EmailResult> {
	const to = env.EBOOK_NOTIFY_EMAIL ?? 'castroomath7@gmail.com';
	const buyerName = escapeHtml(opts.buyerName ?? 'não informado');
	const buyerEmail = escapeHtml(opts.buyerEmail ?? 'não informado');
	const value =
		opts.value != null
			? opts.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
			: '—';
	const body = `
<p style="margin:0 0 14px;">Venda confirmada do <strong style="color:#fafafa;">Ebook ACSM</strong> (${value}).</p>
<p style="margin:0 0 14px;">Comprador: <strong style="color:#fafafa;">${buyerName}</strong><br/>
Email: <strong style="color:#fafafa;">${buyerEmail}</strong><br/>
Cobrança Asaas: ${escapeHtml(opts.paymentId)}</p>
<p style="margin:0;">Ação: liberar o acesso do ebook no Drive pra esse email e avisar o comprador.</p>
`;
	return send({
		to,
		subject: `[Ebook] Venda confirmada — liberar acesso pra ${opts.buyerEmail ?? 'comprador'}`,
		html: baseTemplate('Venda do ebook.', body),
		tag: 'ebook.sale'
	});
}

export async function sendPlanReady(opts: {
	to: string;
	professionalName: string;
	studentName: string;
	planId: string;
}): Promise<EmailResult> {
	const firstName = escapeHtml(opts.professionalName.split(' ')[0] || 'profissional');
	const studentName = escapeHtml(opts.studentName);
	const subject = `Plano de ${opts.studentName} está pronto`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;">O PreceptorFISIC terminou de gerar o plano clínico de <strong style="color:#fafafa;">${studentName}</strong> com fundamentação em diretrizes.</p>
<p style="margin:0;">Revise as restrições, valide a prescrição e publique pro aluno acessar pelo app.</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate(
			'Plano gerado.',
			body,
			`${APP_URL}/planos/${opts.planId}`,
			'Revisar plano →'
		),
		tag: 'plan.ready'
	});
}
