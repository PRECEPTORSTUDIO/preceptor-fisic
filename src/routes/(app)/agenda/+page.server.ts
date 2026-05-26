import { error } from '@sveltejs/kit';
import { getAppointmentsInRange } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	// Semana atual: segunda 00:00 → domingo 23:59 (ou ±3 dias do hoje)
	const now = new Date();
	const dayOfWeek = (now.getDay() + 6) % 7; // 0 = segunda
	const start = new Date(now);
	start.setDate(now.getDate() - dayOfWeek);
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(start.getDate() + 7);

	const appointments = await getAppointmentsInRange(professional.id, start, end);

	return {
		appointments: appointments.map((a) => ({
			...a,
			startsAt: a.startsAt.toISOString()
		})),
		weekStart: start.toISOString(),
		weekEnd: end.toISOString()
	};
}) satisfies PageServerLoad;
