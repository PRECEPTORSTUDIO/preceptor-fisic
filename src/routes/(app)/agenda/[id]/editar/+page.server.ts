import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAppointmentById,
	getProfessionalByAuthId,
	getStudentsByProfessional,
	updateAppointment,
	deleteAppointment
} from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const appt = await getAppointmentById(params.id, professional.id);
	if (!appt) error(404, 'sessão não encontrada');

	const students = await getStudentsByProfessional(professional.id);
	return {
		appointment: { ...appt, startsAt: appt.startsAt.toISOString() },
		students: students.map((s) => ({ id: s.id, name: s.name }))
	};
}) satisfies PageServerLoad;

const TypeEnum = z.enum(['treino', 'avaliacao', 'reabilitacao', 'consulta']);
const StatusEnum = z.enum(['scheduled', 'completed', 'cancelled']);

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const date = String(fd.get('date') ?? '');
		const time = String(fd.get('time') ?? '');
		const studentId = String(fd.get('studentId') ?? '') || null;
		const type = TypeEnum.safeParse(String(fd.get('type') ?? ''));
		const status = StatusEnum.safeParse(String(fd.get('status') ?? 'scheduled'));
		const duration = Number(fd.get('duration') ?? 60);
		const label = String(fd.get('label') ?? '').trim() || undefined;
		const notes = String(fd.get('notes') ?? '').trim() || undefined;

		if (!date || !time || !type.success || !status.success) return fail(400, { error: 'dados inválidos' });
		const startsAt = new Date(`${date}T${time}:00`);
		if (Number.isNaN(startsAt.getTime())) return fail(400, { error: 'data inválida' });

		await updateAppointment({
			appointmentId: params.id!,
			professionalId: professional.id,
			studentId,
			startsAt,
			durationMinutes: duration,
			type: type.data,
			status: status.data,
			label,
			notes
		});

		redirect(303, '/agenda');
	},
	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });
		await deleteAppointment(params.id!, professional.id);
		redirect(303, '/agenda');
	}
};
