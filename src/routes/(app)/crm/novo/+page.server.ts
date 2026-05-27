import { error, fail, redirect } from '@sveltejs/kit';
import {
	createLead,
	getProfessionalByAuthId,
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

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	return {};
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals }) => {
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
		const followStr = String(data.get('nextFollowUpAt') ?? '').trim();
		const nextFollowUpAt = followStr ? new Date(followStr) : null;

		if (!name) return fail(400, { error: 'nome obrigatório', values: { name, phone, email, source, stage, notes } });
		if (!VALID_SOURCES.includes(source)) return fail(400, { error: 'fonte inválida' });
		if (!VALID_STAGES.includes(stage)) return fail(400, { error: 'estágio inválido' });

		const lead = await createLead(pro.id, {
			name,
			phone,
			email,
			source,
			stage,
			notes,
			nextFollowUpAt
		});

		redirect(303, `/crm/${lead.id}`);
	}
};
