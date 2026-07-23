import { error, redirect } from '@sveltejs/kit';
import { getProfessionalByAuthId } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

/**
 * Shell dedicado do CRM (fora do app do profissional). Guard centralizado:
 * toda rota do grupo exige auth + admin — as páginas não precisam repetir.
 */
export const load = (async ({ locals }) => {
	if (!locals.user) redirect(303, '/login?next=/crm');
	const professional = await getProfessionalByAuthId(locals.user.id);
	if (!professional) redirect(303, '/onboarding');
	if (!professional.isAdmin) error(403, 'acesso restrito ao time admin do PreceptorFISIC');
	return { professional };
}) satisfies LayoutServerLoad;
