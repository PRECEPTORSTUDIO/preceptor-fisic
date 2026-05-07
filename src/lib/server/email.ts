/**
 * Email transactional via Resend.
 *
 * Setup:
 *   1. Crie conta em https://resend.com (free tier 100 emails/dia)
 *   2. Verifique seu domínio (ou use onboarding@resend.dev em dev)
 *   3. Crie API key e cole em RESEND_API_KEY no .env.local
 *   4. Configure RESEND_FROM com email verificado (ex: "Preceptor Fisic <noreply@seu-dominio.com>")
 *
 * Sem RESEND_API_KEY: as funções logam e retornam { skipped: true } em vez
 * de falhar — útil em dev/staging sem incomodar com setup.
 */
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { logger } from './logger';

const RESEND_API_KEY = env.RESEND_API_KEY;
const FROM = env.RESEND_FROM ?? 'Preceptor Fisic <onboarding@resend.dev>';

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

const APP_URL =
	pubEnv.PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://preceptor-fisic.vercel.app';

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
      <div style="font:600 15px sans-serif;color:#fafafa;">Preceptor Fisic</div>
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
	const firstName = opts.studentName.split(' ')[0] || 'aluno';
	const subject = `${opts.professionalName} liberou seu acesso ao Preceptor Fisic`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;"><strong style="color:#fafafa;">${opts.professionalName}</strong> cadastrou você no Preceptor Fisic — sua plataforma pra acompanhar treinos prescritos.</p>
<p style="margin:0;">Clique no botão abaixo pra abrir seu app no celular. <strong style="color:#fafafa;">Não precisa criar conta nem baixar nada</strong>: o link é seu acesso direto.</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate('Seu acesso liberado.', body, opts.magicLinkUrl, 'Abrir meu treino →'),
		text: `${opts.professionalName} liberou seu acesso ao Preceptor Fisic. Abra: ${opts.magicLinkUrl}`,
		tag: 'student.magic_link'
	});
}

/**
 * Boas-vindas pro profissional após signup confirmado.
 */
export async function sendProfessionalWelcome(opts: {
	to: string;
	name: string;
}): Promise<EmailResult> {
	const firstName = opts.name.split(' ')[0] || 'profissional';
	const subject = 'Bem-vindo(a) ao Preceptor Fisic';
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;">Seu perfil profissional está ativo. Agora você pode prescrever treinos com IA fundamentada em diretrizes ACSM, com validação clínica automática.</p>
<p style="margin:0;">Bora cadastrar o primeiro aluno?</p>
`;
	return send({
		to: opts.to,
		subject,
		html: baseTemplate('Bem-vindo a bordo.', body, `${APP_URL}/alunos/novo`, 'Cadastrar primeiro aluno →'),
		tag: 'professional.welcome'
	});
}

/**
 * Notifica profissional que o plano gerado pra um aluno está pronto.
 */
export async function sendPlanReady(opts: {
	to: string;
	professionalName: string;
	studentName: string;
	planId: string;
}): Promise<EmailResult> {
	const firstName = opts.professionalName.split(' ')[0];
	const subject = `Plano de ${opts.studentName} está pronto`;
	const body = `
<p style="margin:0 0 14px;">Olá <strong style="color:#fafafa;">${firstName}</strong>,</p>
<p style="margin:0 0 14px;">A IA terminou de gerar o plano clínico de <strong style="color:#fafafa;">${opts.studentName}</strong> com fundamentação em diretrizes.</p>
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
