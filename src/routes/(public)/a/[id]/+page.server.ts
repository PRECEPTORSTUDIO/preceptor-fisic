import { error } from '@sveltejs/kit';
import { getAlunoAppData } from '$lib/server/queries';
import { verifyStudentToken } from '$lib/server/aluno-token';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	const tokenValid = verifyStudentToken(params.id, token);
	if (!tokenValid && !dev) {
		error(403, 'link inválido ou expirado — peça pro seu treinador um novo link.');
	}

	const data = await getAlunoAppData(params.id);
	if (!data) error(404, 'aluno não encontrado');
	return { ...data, tokenValid };
}) satisfies PageServerLoad;
