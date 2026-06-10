import { error, fail } from '@sveltejs/kit';
import {
	getConversationThreads,
	getMessagesForThread,
	postMessage,
	getProfessionalByAuthId
} from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ url, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const threads = await getConversationThreads(professional.id);
	const activeId = url.searchParams.get('t') ?? threads[0]?.id ?? null;
	// getMessagesForThread valida ownership — thread de outro profissional
	// retorna lista vazia em vez de vazar mensagens.
	const activeMessages = activeId ? await getMessagesForThread(activeId, professional.id) : [];

	return { threads, activeId, activeMessages };
}) satisfies PageServerLoad;

export const actions: Actions = {
	send: async ({ request, locals }) => {
		// Actions não têm parent(); resolve professional via locals.user.
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'não autenticado' });
		const data = await request.formData();
		const conversationId = String(data.get('conversationId') ?? '');
		const body = String(data.get('body') ?? '').trim();
		if (!conversationId || !body) return fail(400, { error: 'preencha mensagem' });
		try {
			await postMessage(conversationId, body, 'professional', professional.id);
		} catch {
			return fail(403, { error: 'conversa não encontrada' });
		}
		return { success: true };
	}
};
