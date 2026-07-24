import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	getStudentDetail,
	getProfessionalByAuthId,
	countPlansGeneratedRecent
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { trainingPreferences } from '$lib/server/db/schema';
import { createPlanPlaceholder, generateTrainingPlanInBackground } from '$lib/server/ai/generator';
import {
	hasActiveSubscription,
	SUBSCRIPTION_BLOCKED_MESSAGE
} from '$lib/server/subscription';
import type { Actions, PageServerLoad } from './$types';

// Vercel: estende o limite da função pra 300s (máx do plano Pro) — a geração
// roda em background via waitUntil e precisa fechar o plano COMPLETO antes do
// runtime encerrar. (No adapter não-split o valor efetivo vem do svelte.config,
// mas deixamos aqui consistente.) No Hobby, voltar pra 60.
export const config = {
	maxDuration: 300
};

// Rate limit: cada professional pode gerar no máximo 5 planos a cada 5 minutos.
// Protege quota Gemini de abuse (loop, retries em UI bug, etc.) e limita custo.
const RATE_LIMIT_PLANS = 5;
const RATE_LIMIT_WINDOW_MIN = 5;

// Valores de equipamento aceitos — mesmos termos EN do exercise_catalog
// (o filtro do generator faz match por substring nesses termos).
const EQUIPMENT_VALUES = [
	'body weight',
	'dumbbell',
	'barbell',
	'band',
	'kettlebell',
	'cable',
	'leverage machine',
	'smith machine',
	'stability ball',
	'bench'
];

export const load = (async ({ params, parent, locals }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const detail = await getStudentDetail(params.id, professional.id);
	if (!detail) error(404, 'aluno não encontrado');

	// O parent() só expõe campos de perfil — o status de assinatura vem do
	// registro completo. Flag pra UI desabilitar o gerar antes do POST.
	const full = locals.user ? await getProfessionalByAuthId(locals.user.id) : null;
	const subscriptionBlocked = full ? !hasActiveSubscription(full) : false;

	return { detail, subscriptionBlocked };
}) satisfies PageServerLoad;

export const actions: Actions = {
	generate: async ({ params, request, locals }) => {
		// Em actions a gente não pode usar parent() — pega o professional pelo auth user
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		// Ownership + soft-delete: sem essa guarda um POST direto criaria
		// placeholder de plano apontando pra aluno de outro professional
		// (ou deletado) — getStudentDetail já filtra os dois casos.
		const detail = await getStudentDetail(params.id!, professional.id);
		if (!detail) return fail(404, { error: 'aluno não encontrado' });

		// Gate de assinatura ANTES de qualquer custo: sem status ativo/trial,
		// nada de chamada à IA (o botão some na UI, mas POST direto cai aqui).
		if (!hasActiveSubscription(professional)) {
			return fail(402, { error: SUBSCRIPTION_BLOCKED_MESSAGE, subscriptionBlocked: true });
		}

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
		// Sem truncamento silencioso: as notas alimentam prescrição clínica —
		// cortar o final (onde costuma estar a restrição) é perigoso.
		const rawNotes = String(data.get('notes') ?? '').trim();
		if (rawNotes.length > 2000) {
			return fail(400, {
				error: 'Observações muito longas (máximo 2000 caracteres). Resuma o texto antes de gerar.'
			});
		}
		const notes = rawNotes || undefined;

		// Equipamento disponível: persiste ANTES de disparar a geração — o
		// generator lê training_preferences.equipment_available pra filtrar
		// o catálogo enviado à IA.
		const equipment = data
			.getAll('equipment')
			.map(String)
			.filter((v) => EQUIPMENT_VALUES.includes(v));
		if (detail.preferences) {
			await db
				.update(trainingPreferences)
				.set({ equipmentAvailable: equipment, updatedAt: new Date() })
				.where(eq(trainingPreferences.studentId, params.id!));
		} else {
			await db
				.insert(trainingPreferences)
				.values({ studentId: params.id!, equipmentAvailable: equipment });
		}

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
