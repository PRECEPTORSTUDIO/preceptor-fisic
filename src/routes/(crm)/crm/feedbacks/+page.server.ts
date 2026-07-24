import { fail } from '@sveltejs/kit';
import { generateText } from 'ai';
import { anthropic } from '$lib/server/ai/provider';
import { getAllFeedback, getProfessionalByAuthId } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

/** Feedbacks dos beta testers. Auth + admin garantidos pelo layout do grupo. */
export const load = (async () => {
	const feedbacks = await getAllFeedback();
	return { feedbacks };
}) satisfies PageServerLoad;

async function requireAdmin(locals: App.Locals): Promise<string | null> {
	if (!locals.user) return null;
	const pro = await getProfessionalByAuthId(locals.user.id);
	if (!pro?.isAdmin) return null;
	return pro.id;
}

export const actions: Actions = {
	// Resume TODOS os feedbacks dos beta testers com IA, on-demand (admin).
	summarizeFeedback: async ({ locals }) => {
		const adminId = await requireAdmin(locals);
		if (!adminId) return fail(403, { error: 'acesso restrito' });

		const all = await getAllFeedback();
		if (all.length === 0) return fail(400, { error: 'Ainda não há feedbacks pra resumir.' });

		const corpus = all
			.map(
				(f, i) =>
					`${i + 1}. [${f.category}]${f.page ? ` (em: ${f.page.slice(0, 200)})` : ''} — ${f.authorName ?? 'anônimo'}: ${f.message}`
			)
			.join('\n');

		try {
			const { text } = await generateText({
				model: anthropic('claude-opus-4-8'),
				system:
					'Você é um analista de produto sênior. Resuma feedbacks de beta testers de um app de prescrição de treino clínico (Preceptor FISIC) para a equipe fundadora. Seja objetivo, honesto e acionável. Responda em português do Brasil, em markdown.',
				prompt: `Abaixo estão ${all.length} feedbacks dos beta testers. Gere um resumo executivo curto com estas seções:\n\n1. **Temas principais** — agrupe feedbacks parecidos e diga quantos mencionaram cada tema.\n2. **Bugs reportados** — lista priorizada por gravidade/frequência.\n3. **Sugestões mais pedidas**.\n4. **Top 3 ações recomendadas** pra próxima sprint.\n\nNão invente nada que não esteja nos feedbacks.\n\nFEEDBACKS:\n${corpus}`,
				abortSignal: AbortSignal.timeout(60_000)
			});
			return {
				success: true,
				action: 'summarizeFeedback',
				summary: text,
				summarizedCount: all.length
			};
		} catch (err) {
			return fail(500, { error: 'Falha ao gerar resumo: ' + String(err).slice(0, 150) });
		}
	}
};
