/**
 * Recuperar senha — fluxo Supabase:
 *   1. User digita email aqui
 *   2. supabase.auth.resetPasswordForEmail envia link com token
 *   3. User clica no link → /recuperar/redefinir?token=...
 *   4. Lá ele define nova senha
 */
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		appUrl: env.PUBLIC_APP_URL ?? 'https://preceptor-fisic.vercel.app'
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.supabase) {
			return fail(500, { error: 'Auth não configurado.' });
		}
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		if (!email || !email.includes('@')) {
			return fail(400, { email, error: 'Informe um email válido.' });
		}

		const redirectTo = `${url.origin}/recuperar/redefinir`;
		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, { redirectTo });
		if (error) {
			// Não revela se o email existe (segurança) — mostra success mesmo
			// pra erros tipo "user not found"
			return { success: true, email };
		}
		return { success: true, email };
	}
};
