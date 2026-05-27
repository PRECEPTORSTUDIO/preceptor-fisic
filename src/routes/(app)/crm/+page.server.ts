import { error, fail } from '@sveltejs/kit';
import {
	getLeadsByProfessional,
	getLeadCountsByStage,
	createLead,
	updateLeadStage,
	convertLeadToStudent,
	type LeadStage,
	type LeadSource
} from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

const VALID_STAGES: LeadStage[] = [
	'novo',
	'contatado',
	'trial_agendado',
	'trial_realizado',
	'convertido',
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

	const [leads, counts] = await Promise.all([
		getLeadsByProfessional(professional.id),
		getLeadCountsByStage(professional.id)
	]);

	return {
		leads,
		counts
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	// Move lead entre stages (usado pelo drag-and-drop do Kanban)
	moveStage: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const { getProfessionalByAuthId } = await import('$lib/server/queries');
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const stage = String(data.get('stage') ?? '') as LeadStage;
		if (!id || !VALID_STAGES.includes(stage)) {
			return fail(400, { error: 'id ou stage inválido' });
		}
		await updateLeadStage(id, pro.id, stage);
		return { success: true, action: 'moveStage' };
	},
	// Cria lead rápido (inline no Kanban — apenas nome + stage)
	quickCreate: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const { getProfessionalByAuthId } = await import('$lib/server/queries');
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const stage = String(data.get('stage') ?? 'novo') as LeadStage;
		const source = String(data.get('source') ?? 'outro') as LeadSource;
		if (!name) return fail(400, { error: 'nome obrigatório' });
		if (!VALID_STAGES.includes(stage)) return fail(400, { error: 'stage inválido' });
		if (!VALID_SOURCES.includes(source)) return fail(400, { error: 'source inválido' });

		await createLead(pro.id, { name, stage, source });
		return { success: true, action: 'quickCreate' };
	},
	// Converte lead em aluno via botão "✓ Converter"
	convert: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const { getProfessionalByAuthId } = await import('$lib/server/queries');
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'id obrigatório' });

		const result = await convertLeadToStudent(id, pro.id);
		if (!result) return fail(404, { error: 'lead não encontrado' });
		return { success: true, action: 'convert', studentId: result.studentId };
	}
};
