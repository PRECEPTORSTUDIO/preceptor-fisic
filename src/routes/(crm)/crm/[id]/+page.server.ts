import { error, fail, redirect } from '@sveltejs/kit';
import {
	getLeadById,
	getProfessionalByAuthId,
	updateLead,
	deleteLead,
	type LeadSource,
	type LeadStage
} from '$lib/server/queries';
import { parseLocalDateTime } from '$lib/server/tz';
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

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	if (!professional.isAdmin) error(403, 'acesso restrito ao time admin do PreceptorFISIC');

	const lead = await getLeadById(params.id!);
	if (!lead) error(404, 'lead não encontrado');

	return { lead };
}) satisfies PageServerLoad;

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro?.isAdmin) return fail(403, { error: 'acesso restrito' });

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const phone = String(data.get('phone') ?? '').trim() || null;
		const email = String(data.get('email') ?? '').trim() || null;
		const source = String(data.get('source') ?? 'outro') as LeadSource;
		const stage = String(data.get('stage') ?? 'visitante') as LeadStage;
		const notes = String(data.get('notes') ?? '').trim() || null;
		const lostReason = String(data.get('lostReason') ?? '').trim() || null;
		// datetime-local vem sem timezone — parseLocalDateTime interpreta como
		// horário de Brasília (server roda em UTC) e saneia data malformada.
		const nextFollowUpAt = parseLocalDateTime(String(data.get('nextFollowUpAt') ?? ''));

		if (!name) return fail(400, { error: 'nome obrigatório' });
		if (!VALID_SOURCES.includes(source)) return fail(400, { error: 'fonte inválida' });
		if (!VALID_STAGES.includes(stage)) return fail(400, { error: 'estágio inválido' });

		const updated = await updateLead(params.id!, {
			name,
			phone,
			email,
			source,
			stage,
			notes,
			nextFollowUpAt,
			lostReason: stage === 'perdido' || stage === 'cancelado' ? lostReason : null
		});
		if (!updated) return fail(404, { error: 'lead não encontrado' });
		return { success: true, action: 'save' };
	},
	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const pro = await getProfessionalByAuthId(locals.user.id);
		if (!pro?.isAdmin) return fail(403, { error: 'acesso restrito' });
		const ok = await deleteLead(params.id!);
		if (!ok) return fail(404, { error: 'lead não encontrado' });
		redirect(303, '/crm');
	}
};
