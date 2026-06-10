import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
	getProfessionalByAuthId,
	getStudentsByProfessional,
	createAppointment
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { students } from '$lib/server/db/schema';
import { sendAppointmentNotification } from '$lib/server/email';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	const students = await getStudentsByProfessional(professional.id);
	return { students: students.map((s) => ({ id: s.id, name: s.name })) };
}) satisfies PageServerLoad;

const TypeEnum = z.enum(['treino', 'avaliacao', 'reabilitacao', 'consulta']);

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const date = String(fd.get('date') ?? '');
		const time = String(fd.get('time') ?? '');
		const studentId = String(fd.get('studentId') ?? '') || null;
		const typeRaw = String(fd.get('type') ?? 'treino');
		const duration = Number(fd.get('duration') ?? 60);
		const label = String(fd.get('label') ?? '').trim() || undefined;
		const notes = String(fd.get('notes') ?? '').trim() || undefined;

		if (!date || !time) return fail(400, { error: 'data e horário são obrigatórios' });
		const type = TypeEnum.safeParse(typeRaw);
		if (!type.success) return fail(400, { error: 'tipo inválido' });

		const startsAt = new Date(`${date}T${time}:00`);
		if (Number.isNaN(startsAt.getTime())) return fail(400, { error: 'data inválida' });
		if (duration < 15 || duration > 240) return fail(400, { error: 'duração inválida' });

		// Ownership: studentId vem do form — valida que o aluno pertence a
		// este profissional antes de criar o appointment (e antes de mandar
		// email pro aluno, que vazaria o nome do profissional pra terceiros).
		if (studentId) {
			const [owned] = await db
				.select({ professionalId: students.professionalId })
				.from(students)
				.where(eq(students.id, studentId))
				.limit(1);
			if (owned?.professionalId !== professional.id) {
				return fail(403, { error: 'aluno não encontrado' });
			}
		}

		await createAppointment({
			professionalId: professional.id,
			studentId,
			startsAt,
			durationMinutes: duration,
			type: type.data,
			label,
			notes
		});

		// Notifica aluno por email se ele tem email cadastrado
		if (studentId) {
			try {
				const [student] = await db
					.select({ name: students.name, email: students.email })
					.from(students)
					.where(eq(students.id, studentId))
					.limit(1);
				if (student?.email) {
					sendAppointmentNotification({
						to: student.email,
						studentName: student.name,
						professionalName: professional.name,
						startsAt,
						durationMinutes: duration,
						type: type.data,
						label,
						studentId
					}).catch((err) =>
						logger.error(
							{ err: String(err).slice(0, 200) },
							'appointment.notify.send_failed'
						)
					);
				}
			} catch (err) {
				logger.error(
					{ err: String(err).slice(0, 200) },
					'appointment.notify.lookup_failed'
				);
			}
		}

		redirect(303, '/agenda');
	}
};
