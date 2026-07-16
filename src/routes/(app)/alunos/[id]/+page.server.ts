import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env as pubEnv } from '$env/dynamic/public';
import {
	getStudentDetail,
	getProfessionalByAuthId,
	getStudentLoadEvolution,
	getRecentTrainingSessions,
	setCardiovascularRisk
} from '$lib/server/queries';
import { computeCvRisk } from '$lib/server/clinical/cv-risk-service';
import { db } from '$lib/server/db';
import { trainingPlans } from '$lib/server/db/schema';
import { signStudentToken } from '$lib/server/aluno-token';
import { sendStudentMagicLink } from '$lib/server/email';
import { checkRateLimit } from '$lib/server/rate-limit';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

// Base pública dos links do aluno — PUBLIC_APP_URL evita copiar/enviar link
// com host de preview do Vercel (protegido por auth) quando o personal
// navega por ele. Fallback: origin da request.
function appBaseUrl(origin: string): string {
	return (pubEnv.PUBLIC_APP_URL?.replace(/\/$/, '') || origin).replace(/\/$/, '');
}

export const load = (async ({ params, parent, url }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const [detail, loadEvolution, recentSessions, planStatuses] = await Promise.all([
		getStudentDetail(params.id, professional.id),
		getStudentLoadEvolution(params.id),
		getRecentTrainingSessions(params.id, professional.id),
		// Status real dos planos (pending/generating/failed) — getStudentDetail
		// só expõe isActive, e plano gerando/falho não pode aparecer como "Encerrado".
		db
			.select({ id: trainingPlans.id, status: trainingPlans.status })
			.from(trainingPlans)
			.where(eq(trainingPlans.studentId, params.id))
	]);
	if (!detail) error(404, 'aluno não encontrado');

	const statusById = new Map(planStatuses.map((p) => [p.id, p.status]));
	const plans = detail.plans.map((p) => ({
		...p,
		status: statusById.get(p.id) ?? (p.isActive ? 'published' : 'archived')
	}));

	const base = appBaseUrl(url.origin);
	const token = signStudentToken(params.id);
	const alunoUrl = `${base}/a/${params.id}?t=${token}`;
	const fillUrl = `${base}/a/${params.id}/completar?t=${token}`;

	// Estratificação de risco CV sugerida (ACSM adaptado) — o profissional
	// confirma/sobrescreve. `currentRisk` = valor já gravado no perfil.
	const cvRisk = computeCvRisk(detail);
	const currentRisk = detail.healthProfile?.cardiovascularRisk ?? null;

	return {
		detail: { ...detail, plans },
		alunoUrl,
		fillUrl,
		loadEvolution,
		recentSessions,
		cvRisk,
		currentRisk
	};
}) satisfies PageServerLoad;

const RISK_LEVELS = ['baixo', 'moderado', 'alto', 'muito_alto'] as const;

export const actions: Actions = {
	// Confirma (ou sobrescreve) o risco CV sugerido pela estratificação
	// automática. A decisão final é sempre humana — só grava o que o
	// profissional escolheu no card.
	applyCvRisk: async ({ params, locals, request }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		// Garante que o aluno pertence a este profissional antes de escrever.
		const detail = await getStudentDetail(params.id!, professional.id);
		if (!detail) return fail(404, { error: 'aluno não encontrado' });

		const fd = await request.formData();
		const level = String(fd.get('level') ?? '');
		if (!(RISK_LEVELS as readonly string[]).includes(level)) {
			return fail(400, { error: 'nível de risco inválido' });
		}

		const previous = detail.healthProfile?.cardiovascularRisk ?? null;
		await setCardiovascularRisk(params.id!, level as (typeof RISK_LEVELS)[number]);

		// Risco clínico é dado sensível — registra quem mudou, de quê pra quê.
		audit({
			action: 'health.cv_risk_updated',
			professionalId: professional.id,
			entityType: 'student',
			entityId: params.id,
			payload: { from: previous, to: level }
		});

		return { cvRiskSaved: true, level };
	},

	resendMagicLink: async ({ params, locals, url }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const detail = await getStudentDetail(params.id!, professional.id);
		if (!detail) return fail(404, { error: 'aluno não encontrado' });
		if (!detail.student.email) {
			return fail(400, {
				error: 'Aluno não tem email cadastrado. Adicione o email primeiro em Editar.'
			});
		}

		// Rate limit por professional+aluno — protege a quota do Resend de
		// retries/spam (3 envios / 10 min).
		const rl = checkRateLimit('email_send', `resend:${professional.id}:${params.id}`);
		if (!rl.allowed) {
			return fail(429, {
				error: 'Muitos envios de email. Aguarde alguns minutos e tente de novo.'
			});
		}

		const token = signStudentToken(params.id!);
		const magicLinkUrl = `${appBaseUrl(url.origin)}/a/${params.id}?t=${token}`;
		const result = await sendStudentMagicLink({
			to: detail.student.email,
			studentName: detail.student.name,
			professionalName: professional.name,
			magicLinkUrl
		});

		if (result.skipped) {
			return fail(503, {
				error: 'Serviço de email não configurado (RESEND_API_KEY ausente).'
			});
		}
		if (!result.sent) {
			return fail(500, { error: result.error ?? 'Falha ao enviar.' });
		}

		// Reenvio de link dá acesso a dados de saúde — precisa de trilha.
		audit({
			action: 'student.magic_link_resent',
			professionalId: professional.id,
			entityType: 'student',
			entityId: params.id,
			payload: { sentTo: detail.student.email }
		});

		return { success: true, sentTo: detail.student.email };
	}
};
