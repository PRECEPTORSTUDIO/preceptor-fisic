import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	// Logado → dashboard. Não-logado → renderiza a landing (não redireciona pra /login).
	if (locals.session) redirect(303, '/dashboard');
	return {};
}) satisfies PageServerLoad;
