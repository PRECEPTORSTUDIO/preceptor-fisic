import { error } from '@sveltejs/kit';
import { getStudentsByProfessional, getDashboardStats } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) {
		// Sem auth/professional — devolve mock pra UI continuar funcional em modo design
		return { students: [], stats: null, professional: null };
	}

	const [students, stats] = await Promise.all([
		getStudentsByProfessional(professional.id),
		getDashboardStats(professional.id)
	]);

	return { students, stats, professional };
}) satisfies PageServerLoad;
