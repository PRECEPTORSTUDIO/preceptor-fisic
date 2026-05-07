/**
 * Redefinir senha — destino do link enviado por email.
 *
 * Supabase manda link com fragment hash tipo:
 *   /recuperar/redefinir#access_token=...&type=recovery
 *
 * O auth-helpers do Supabase já consome o hash automaticamente no client
 * e cria a sessão. No server-side só validamos que existe sessão de
 * recovery, e ao submeter, atualizamos a senha via updateUser.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.supabase) {
			return fail(500, { error: 'Auth não configurado.' });
		}
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');

		if (password.length < 8) {
			return fail(400, { error: 'Senha precisa ter pelo menos 8 caracteres.' });
		}
		if (password !== confirm) {
			return fail(400, { error: 'As senhas não coincidem.' });
		}

		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) {
			return fail(400, {
				error: 'Não foi possível atualizar. O link pode ter expirado — solicite um novo.'
			});
		}

		redirect(303, '/login?reset=ok');
	}
};
