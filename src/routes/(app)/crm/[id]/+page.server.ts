import { error, fail, redirect } from '@sveltejs/kit';
import {
	getLeadById,
	getProfessionalByAuthId,
	updateLead,
	deleteLead,
	convertLeadToStudent,
	type LeadSource,
	type LeadStage
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

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const lead = await getLeadById(params.id!, professional.id);
	if (!lead) error(404, 'lead não encontrado');

	return { lead };
}) satisfies PageServerLoad;

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const phone = String(data.get('phone') ?? '').trim() || null;
		const email = String(data.get('email') ?? '').trim() || null;
		const source = String(data.get('source') ?? 'outro') as LeadSource;
		const stage = String(data.get('stage') ?? 'novo') as LeadStage;
		const notes = String(data.get('notes') ?? '').trim() || null;
		const lostReason = String(data.get('lostReason') ?? '').trim() || null;
		const followStr = String(data.get('nextFollowUpAt') ?? '').trim();
		const nextFollowUpAt = followStr ? new Date(followStr) : null;

		if (!name) return fail(400, { error: 'nome obrigatório' });
		if (!VALID_SOURCES.includes(source)) return fail(400, { error: 'fonte inválida' });
		if (!VALID_STAGES.includes(stage)) return fail(400, { error: 'estágio inválido' });

		const updated = await updateLead(params.id!, pro.id, {
			name,
			phone,
			email,
			source,
			stage,
			notes,
			nextFollowUpAt,
			lostReason: stage === 'perdido' ? lostReason : null
		});
		if (!updated) return fail(404, { error: 'lead não encontrado' });
		return { success: true, action: 'save' };
	},
	convert: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });
		const result = await convertLeadToStudent(params.id!, pro.id);
		if (!result) return fail(404, { error: 'lead não encontrado' });
		redirect(303, `/alunos/${result.studentId}`);
	},
	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro) return fail(401, { error: 'sem profissional' });
		const ok = await deleteLead(params.id!, pro.id);
		if (!ok) return fail(404, { error: 'lead não encontrado' });
		redirect(303, '/crm');
	}
};
