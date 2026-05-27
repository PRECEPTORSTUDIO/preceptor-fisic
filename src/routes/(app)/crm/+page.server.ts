import { error, fail } from '@sveltejs/kit';
import {
	getAllLeads,
	getLeadCountsByStage,
	createLead,
	updateLeadStage,
	getProfessionalByAuthId,
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

	const [leads, counts] = await Promise.all([getAllLeads(), getLeadCountsByStage()]);

	return { leads, counts };
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
	}
};
