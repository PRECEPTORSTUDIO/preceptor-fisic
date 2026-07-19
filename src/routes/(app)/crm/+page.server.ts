import { error, fail } from '@sveltejs/kit';
import { generateText } from 'ai';
import { google } from '$lib/server/ai/provider';
import {
	getAllLeads,
	getLeadCountsByStage,
	createLead,
	updateLeadStage,
	getProfessionalByAuthId,
	getAllFeedback,
	type LeadStage,
	type LeadSource
} from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

const VALID_STAGES: LeadStage[] = [
	'visitante',
	'cadastrou',
	'ativou_aluno',
	'trial',
	'pagante',
	'cancelado',
	'perdido'
];
const VALID_SOURCES: LeadSource[] = [
	'instagram',
	'indicacao',
	'anuncio',
	'site',
	'whatsapp',
	'outro'
];

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	if (!professional.isAdmin) error(403, 'acesso restrito ao time admin do Preceptor Fisic');

	const [leads, counts, feedbacks] = await Promise.all([
		getAllLeads(),
		getLeadCountsByStage(),
		getAllFeedback()
	]);

	return { leads, counts, feedbacks };
}) satisfies PageServerLoad;

/** Guard simples — verifica se o user é admin via locals + DB lookup */
async function requireAdmin(locals: App.Locals): Promise<string | null> {
	if (!locals.user) return null;
	const pro = await getProfessionalByAuthId(locals.user.id);
	if (!pro?.isAdmin) return null;
	return pro.id;
}

export const actions: Actions = {
	moveStage: async ({ request, locals }) => {
		const adminId = await requireAdmin(locals);
		if (!adminId) return fail(403, { error: 'acesso restrito' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const stage = String(data.get('stage') ?? '') as LeadStage;
		if (!id || !VALID_STAGES.includes(stage)) {
			return fail(400, { error: 'id ou stage inválido' });
		}
		await updateLeadStage(id, stage);
		return { success: true, action: 'moveStage' };
	},
	quickCreate: async ({ request, locals }) => {
		const adminId = await requireAdmin(locals);
		if (!adminId) return fail(403, { error: 'acesso restrito' });

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const stage = String(data.get('stage') ?? 'visitante') as LeadStage;
		const source = String(data.get('source') ?? 'outro') as LeadSource;
		if (!name) return fail(400, { error: 'nome obrigatório' });
		if (!VALID_STAGES.includes(stage)) return fail(400, { error: 'stage inválido' });
		if (!VALID_SOURCES.includes(source)) return fail(400, { error: 'source inválido' });

		await createLead({ name, stage, source, professionalId: adminId });
		return { success: true, action: 'quickCreate' };
	},

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
				// Alias `-latest`, não snapshot fixo: o Google bloqueia versões
				// antigas pra chaves novas ("no longer available to new users").
				model: google('gemini-flash-latest'),
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
