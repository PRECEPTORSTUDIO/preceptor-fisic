/**
 * Recuperar senha — fluxo Supabase:
 *   1. User digita email aqui
 *   2. supabase.auth.resetPasswordForEmail envia link com token
 *   3. User clica no link → /recuperar/redefinir?token=...
 *   4. Lá ele define nova senha
 */
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { checkAndAudit } from '$lib/server/rate-limit';
import { audit, clientFingerprint } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async () => {
	return {
		appUrl: env.PUBLIC_APP_URL ?? 'https://preceptor-fisic.vercel.app'
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	default: async ({ request, locals, url, getClientAddress }) => {
		// Rate limit: 3 tentativas / 10 min por IP (anti email-bomb)
		const rl = await checkAndAudit({ key: 'password_reset', request, getClientAddress });
		if (!rl.allowed) {
			return fail(429, { email: '', error: rl.message ?? 'Muitas tentativas.' });
		}

		if (!locals.supabase) {
			return fail(500, { error: 'Auth não configurado.' });
		}
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		if (!email || !email.includes('@')) {
			return fail(400, { email, error: 'Informe um email válido.' });
		}

		const redirectTo = `${url.origin}/recuperar/redefinir`;
		await locals.supabase.auth.resetPasswordForEmail(email, { redirectTo });

		// Audita o request (não revela se email existe ou não — sempre 'success')
		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'auth.password_reset_request',
			entityType: 'auth',
			payload: { email: email.slice(0, 80) },
			...fp
		});

		// Sempre retorna success (não revela existência da conta)
		return { success: true, email };
	}
};
