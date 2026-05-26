import { error, fail, redirect } from '@sveltejs/kit';
import { getProfessionalByAuthId, createExercise } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	return {};
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		const muscleGroup = String(fd.get('muscleGroup') ?? '').trim();
		if (!name || !muscleGroup) return fail(400, { error: 'nome e grupo muscular são obrigatórios' });

		const contraindications = String(fd.get('contraindications') ?? '')
			.split(/[,\n;]+/)
			.map((x) => x.trim())
			.filter(Boolean);

		await createExercise({
			professionalId: professional.id,
			code: String(fd.get('code') ?? '').trim() || undefined,
			name,
			muscleGroup,
			equipment: String(fd.get('equipment') ?? '').trim() || undefined,
			level: String(fd.get('level') ?? '').trim() || undefined,
			pattern: String(fd.get('pattern') ?? '').trim() || undefined,
			executionNotes: String(fd.get('executionNotes') ?? '').trim() || undefined,
			contraindications
		});

		redirect(303, '/exercicios/meus');
	}
};
