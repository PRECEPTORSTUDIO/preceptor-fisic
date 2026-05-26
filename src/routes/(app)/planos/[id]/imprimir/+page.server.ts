import { error } from '@sveltejs/kit';
import { getPlanDetail, getProfessionalByAuthId, getStudentDetail } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, locals }) => {
	if (!locals.user) error(401, 'não autenticado');
	const professional = await getProfessionalByAuthId(locals.user.id);
	if (!professional) error(401, 'professional não encontrado');

	const plan = await getPlanDetail(params.id, professional.id);
	if (!plan) error(404, 'plano não encontrado');

	const studentDetail = await getStudentDetail(plan.studentId, professional.id);

	return { plan, professional, studentDetail };
}) satisfies PageServerLoad;
