import { error, fail } from '@sveltejs/kit';
import { generateText } from 'ai';
import { google } from '$lib/server/ai/provider';
import {
	getProfessionalByAuthId,
	createFeedback,
	getMyFeedback,
	getAllFeedback,
	FEEDBACK_CATEGORIES,
	type FeedbackCategory
} from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

const VALID_CATEGORIES = FEEDBACK_CATEGORIES.map((c) => c.id);

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const mine = await getMyFeedback(professional.id);
	// Só admin vê o consolidado de todos + resumo por IA.
	const all = professional.isAdmin ? await getAllFeedback() : [];

	return { mine, all, isAdmin: professional.isAdmin };
}) satisfies PageServerLoad;

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'profissional não encontrado' });

		const fd = await request.formData();
		const category = String(fd.get('category') ?? 'outro') as FeedbackCategory;
		const message = String(fd.get('message') ?? '').trim();
		const page = String(fd.get('page') ?? '').trim() || null;

		if (!VALID_CATEGORIES.includes(category)) return fail(400, { error: 'categoria inválida' });
		if (message.length < 3)
			return fail(400, { error: 'Escreva um pouco mais no feedback.', values: { category, message } });
		if (message.length > 4000)
			return fail(400, { error: 'Feedback muito longo (máx 4000 caracteres).', values: { category, message } });

		await createFeedback({
			professionalId: pro.id,
			authorName: pro.name,
			authorEmail: pro.email,
			category,
			message,
			page
		});
		return { success: true };
	},

	// Admin-only: resume TODOS os feedbacks com IA, on-demand.
	summarize: async ({ locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro?.isAdmin) return fail(403, { error: 'acesso restrito' });

		const all = await getAllFeedback();
		if (all.length === 0) return fail(400, { error: 'Ainda não há feedbacks pra resumir.' });

		const corpus = all
			.map(
				(f, i) =>
					`${i + 1}. [${f.category}]${f.page ? ` (em: ${f.page})` : ''} — ${f.authorName ?? 'anônimo'}: ${f.message}`
			)
			.join('\n');

		try {
			const { text } = await generateText({
				model: google('gemini-2.5-flash'),
				system:
					'Você é um analista de produto sênior. Resuma feedbacks de beta testers de um app de prescrição de treino clínico (Preceptor FISIC) para a equipe fundadora. Seja objetivo, honesto e acionável. Responda em português do Brasil, em markdown.',
				prompt: `Abaixo estão ${all.length} feedbacks dos beta testers. Gere um resumo executivo curto com estas seções:\n\n1. **Temas principais** — agrupe feedbacks parecidos e diga quantos mencionaram cada tema.\n2. **Bugs reportados** — lista priorizada por gravidade/frequência.\n3. **Sugestões mais pedidas**.\n4. **Top 3 ações recomendadas** pra próxima sprint.\n\nNão invente nada que não esteja nos feedbacks.\n\nFEEDBACKS:\n${corpus}`,
				abortSignal: AbortSignal.timeout(60_000)
			});
			return { summary: text, summarizedCount: all.length };
		} catch (err) {
			return fail(500, { error: 'Falha ao gerar resumo: ' + String(err).slice(0, 150) });
		}
	}
};
