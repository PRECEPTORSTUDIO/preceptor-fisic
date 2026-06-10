import { fail, redirect } from '@sveltejs/kit';
import { checkAndAudit } from '$lib/server/rate-limit';
import { audit, clientFingerprint } from '$lib/server/audit';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async ({ request, locals, getClientAddress }) => {
		// Rate limit: 5 tentativas / minuto por IP
		const rl = await checkAndAudit({ key: 'login', request, getClientAddress });
		if (!rl.allowed) {
			return fail(429, { email: '', error: rl.message ?? 'Muitas tentativas.' });
		}

		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');

		if (!locals.supabase) {
			return fail(500, { email, error: 'Supabase não configurado. Verifique .env.local.' });
		}
		if (!email || !password) {
			return fail(400, { email, error: 'Preencha email e senha.' });
		}

		const { data: authData, error } = await locals.supabase.auth.signInWithPassword({
			email,
			password
		});
		const fp = clientFingerprint(request, getClientAddress);
		if (error) {
			audit({
				action: 'auth.login',
				entityType: 'auth',
				payload: { ok: false, email: email.slice(0, 80), reason: error.message },
				...fp
			});
			return fail(401, { email, error: error.message });
		}

		audit({
			action: 'auth.login',
			entityType: 'auth',
			entityId: authData.user?.id ?? null,
			payload: { ok: true, email: email.slice(0, 80) },
			...fp
		});

		redirect(303, '/dashboard');
	},

	signup: async ({ request, locals, getClientAddress }) => {
		// Rate limit signup mais agressivo: 3 / 10 min por IP
		const rl = await checkAndAudit({ key: 'signup', request, getClientAddress });
		if (!rl.allowed) {
			return fail(429, { email: '', error: rl.message ?? 'Muitas tentativas.' });
		}

		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');
		const name = String(data.get('name') ?? '');
		const cref = String(data.get('cref') ?? '').trim();
		const acceptedTerms = data.get('accept_terms');

		if (!locals.supabase) {
			return fail(500, { email, error: 'Supabase não configurado. Verifique .env.local.' });
		}
		if (!email || !password || !name) {
			return fail(400, { email, error: 'Preencha nome, email e senha.' });
		}
		if (password.length < 8) {
			return fail(400, { email, error: 'Senha precisa ter pelo menos 8 caracteres.' });
		}
		// Consent LGPD explícito — checkbox do form. Sem ele não cria conta;
		// o aceite (com timestamp) fica gravado no user_metadata pra auditoria.
		if (!acceptedTerms) {
			return fail(400, {
				email,
				error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.'
			});
		}
		// Validação leve do registro profissional: aceita CREF/CREFITO/CRM com
		// 4-6 dígitos + sufixo opcional. Não valida contra o conselho (não há
		// API pública) — barra só lixo óbvio tipo "abc" ou "1".
		if (cref && !/\d{4,6}/.test(cref)) {
			return fail(400, {
				email,
				error: 'Registro profissional inválido — informe o número do CREF/CREFITO/CRM.'
			});
		}

		const { data: authData, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: {
				data: { name, cref, accepted_terms_at: new Date().toISOString() }
			}
		});
		const fp = clientFingerprint(request, getClientAddress);
		if (error) {
			audit({
				action: 'auth.signup',
				entityType: 'auth',
				payload: { ok: false, email: email.slice(0, 80), reason: error.message },
				...fp
			});
			return fail(400, { email, error: error.message });
		}

		audit({
			action: 'auth.signup',
			entityType: 'auth',
			entityId: authData.user?.id ?? null,
			payload: { ok: true, email: email.slice(0, 80), hasName: !!name, hasCref: !!cref },
			...fp
		});

		redirect(303, '/dashboard');
	}
};
