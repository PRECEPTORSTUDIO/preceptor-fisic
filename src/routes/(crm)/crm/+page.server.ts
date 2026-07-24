import { getAllLeads, getLeadCountsByStage } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

/** Visão geral do CRM. Auth + admin já garantidos pelo layout do grupo. */
export const load = (async () => {
	const [leads, counts] = await Promise.all([getAllLeads(), getLeadCountsByStage()]);
	return { leads, counts };
}) satisfies PageServerLoad;
