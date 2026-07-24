import { error, fail } from '@sveltejs/kit';
import { getAlunoThread, postAlunoMessage } from '$lib/server/queries';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
		error(403, 'link inválido ou expirado — peça pro seu treinador um novo link.');
	}

	const thread = await getAlunoThread(params.id);
	if (!thread) error(404, 'conversa não encontrada');

	return { thread, token };
}) satisfies PageServerLoad;

export const actions: Actions = {
	send: async ({ params, request, url }) => {
		// Token vem via query (?t=) OU hidden input do form — a action URL não
		// preserva a query string, então o form manda o token de novo em _t.
		const fd = await request.formData();
		const token = url.searchParams.get('t') ?? (String(fd.get('_t') ?? '').trim() || null);
		if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
			return fail(403, { error: 'sessão expirou — abra o link de novo' });
		}

		const body = String(fd.get('body') ?? '').trim();
		if (!body) return fail(400, { error: 'escreva uma mensagem' });
		if (body.length > 2000) return fail(400, { error: 'mensagem muito longa (máx 2000)' });

		try {
			// conversationId NÃO vem do cliente — o servidor deriva do studentId
			// (já validado pelo token). Sem superfície de IDOR.
			await postAlunoMessage(params.id, body);
		} catch {
			return fail(403, { error: 'conversa não encontrada' });
		}
		return { success: true };
	}
};
