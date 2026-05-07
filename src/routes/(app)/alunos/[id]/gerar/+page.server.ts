import { error, fail, redirect } from '@sveltejs/kit';
import {
	getStudentDetail,
	getProfessionalByAuthId,
	countPlansGeneratedRecent
} from '$lib/server/queries';
import { createPlanPlaceholder, generateTrainingPlanInBackground } from '$lib/server/ai/generator';
import type { Actions, PageServerLoad } from './$types';

// Vercel: estende o limite da função pra 60s (Hobby max). Plano com Flash leva
// ~10-20s, com Pro ~30-50s. Sem isso, default é 10s e a IA morre antes de salvar.
export const config = {
	maxDuration: 60
};

// Rate limit: cada professional pode gerar no máximo 5 planos a cada 5 minutos.
// Protege quota Gemini de abuse (loop, retries em UI bug, etc.) e limita custo.
const RATE_LIMIT_PLANS = 5;
const RATE_LIMIT_WINDOW_MIN = 5;

export const load: PageServerLoad = async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const detail = await getStudentDetail(params.id, professional.id);
	if (!detail) error(404, 'aluno não encontrado');

	return { detail };
};

export const actions: Actions = {
	generate: async ({ params, request, locals }) => {
		// Em actions a gente não pode usar parent() — pega o professional pelo auth user
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		// Rate limit check ANTES de criar placeholder ou chamar IA
		const recent = await countPlansGeneratedRecent(professional.id, RATE_LIMIT_WINDOW_MIN);
		if (recent >= RATE_LIMIT_PLANS) {
			return fail(429, {
				error: `Limite de ${RATE_LIMIT_PLANS} planos a cada ${RATE_LIMIT_WINDOW_MIN} minutos atingido. Aguarde alguns minutos e tente de novo.`,
				rateLimited: true,
				windowMinutes: RATE_LIMIT_WINDOW_MIN
			});
		}

		const data = await request.formData();
		const notes = String(data.get('notes') ?? '').slice(0, 2000) || undefined;

		const planId = await createPlanPlaceholder(params.id!, professional.id);

		// Dispara em background com waitUntil — runtime fica vivo até a Promise
		// resolver (ou até maxDuration acima). User vê redirect imediato.
		generateTrainingPlanInBackground({
			professionalId: professional.id,
			studentId: params.id!,
			planId,
			notes
		});

		redirect(303, `/planos/${planId}`);
	}
};
