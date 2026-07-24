import { fail } from '@sveltejs/kit';
import {
	getAllLeads,
	getLeadCountsByStage,
	updateLeadStage,
	getProfessionalByAuthId,
	type LeadStage
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

/** Lista completa de leads. Auth + admin garantidos pelo layout do grupo. */
export const load = (async () => {
	const [leads, counts] = await Promise.all([getAllLeads(), getLeadCountsByStage()]);
	return { leads, counts };
}) satisfies PageServerLoad;

async function requireAdmin(locals: App.Locals): Promise<string | null> {
	if (!locals.user) return null;
	const pro = await getProfessionalByAuthId(locals.user.id);
	if (!pro?.isAdmin) return null;
	return pro.id;
}

export const actions: Actions = {
	// Mudança de estágio inline na tabela (select por linha)
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
	}
};
