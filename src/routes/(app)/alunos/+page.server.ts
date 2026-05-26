import { error } from '@sveltejs/kit';
import { getStudentsByProfessional } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	const students = await getStudentsByProfessional(professional.id);
	return { students };
}) satisfies PageServerLoad;
