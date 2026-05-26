import { error } from '@sveltejs/kit';
import { getExerciseLibrary } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	const exercises = await getExerciseLibrary(professional.id);
	return { exercises };
}) satisfies PageServerLoad;
