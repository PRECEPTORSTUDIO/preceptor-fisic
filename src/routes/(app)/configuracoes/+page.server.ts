import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { getProfessionalByAuthId, updateProfessional } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	return { professional };
}) satisfies PageServerLoad;

const SpecialtyEnum = z.enum([
	'prescricao_clinica',
	'treinamento_funcional',
	'reabilitacao',
	'musculacao',
	'personal',
	'pilates',
	'outro'
]);

export const actions: Actions = {
	saveProfile: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });

		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		const cref = String(fd.get('cref') ?? '').trim() || null;
		const specialtyRaw = String(fd.get('specialty') ?? 'prescricao_clinica');

		if (name.length < 2) return fail(400, { error: 'nome obrigatório' });
		const specialty = SpecialtyEnum.safeParse(specialtyRaw);
		if (!specialty.success) return fail(400, { error: 'especialidade inválida' });

		try {
			await updateProfessional({
				authUserId: locals.user.id,
				name,
				cref,
				specialty: specialty.data
			});
		} catch (e) {
			return fail(500, { error: (e as Error).message });
		}

		return { success: true, msg: 'Perfil atualizado.' };
	}
};
