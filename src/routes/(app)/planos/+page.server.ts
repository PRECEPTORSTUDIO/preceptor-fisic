import { error } from '@sveltejs/kit';
import { getPlansByProfessional } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const plans = await getPlansByProfessional(professional.id);
	return { plans };
}) satisfies PageServerLoad;
