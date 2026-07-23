import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import {
	getAppointmentById,
	getProfessionalByAuthId,
	getStudentsByProfessional,
	updateAppointment,
	deleteAppointment
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { students } from '$lib/server/db/schema';
import { sendAppointmentNotification } from '$lib/server/email';
import { logger } from '$lib/server/logger';
import { isUuid } from '$lib/server/validation';
import { parseLocalDateTime } from '$lib/server/tz';
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
		// null (não undefined): permite LIMPAR o campo — undefined faz o Drizzle
		// pular a coluna e o valor antigo ficava impossível de apagar.
		const label = String(fd.get('label') ?? '').trim() || null;
		const notes = String(fd.get('notes') ?? '').trim() || null;

		if (!date || !time || !type.success || !status.success)
			return fail(400, { error: 'dados inválidos' });
		if (studentId && !isUuid(studentId)) return fail(400, { error: 'aluno inválido' });
		// Parse como horário de Brasília — new Date('...T...') no server (Vercel
		// = UTC) deslocaria tudo em 3h (C14).
		const startsAt = parseLocalDateTime(`${date}T${time}`);
		if (!startsAt) return fail(400, { error: 'data inválida' });
		// duration sem validação ia inserir NaN numa coluna integer (500).
		if (!Number.isFinite(duration) || duration < 15 || duration > 240)
			return fail(400, { error: 'duração inválida' });

		// Ownership: studentId vem do form — valida que o aluno pertence a
		// este profissional antes de anexá-lo à sessão (mesmo guard do criar).
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

		// Estado anterior pra detectar remarcação (startsAt mudou) sem depender
		// do que o client mandou.
		const before = await getAppointmentById(params.id!, professional.id);
		if (!before) return fail(404, { error: 'sessão não encontrada' });

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

		// Notifica o aluno por email quando a sessão é remarcada OU cancelada —
		// o email é o único canal do aluno; sem isso ele comparece no horário
		// antigo (ou numa sessão que não existe mais).
		const rescheduled =
			status.data === 'scheduled' && before.startsAt.getTime() !== startsAt.getTime();
		const cancelledNow = status.data === 'cancelled' && before.status !== 'cancelled';
		if ((rescheduled || cancelledNow) && studentId) {
			try {
				const [student] = await db
					.select({
						name: students.name,
						email: students.email,
						linkTokenVersion: students.linkTokenVersion
					})
					.from(students)
					.where(eq(students.id, studentId))
					.limit(1);
				if (student?.email) {
					const emailPromise = sendAppointmentNotification({
						to: student.email,
						studentName: student.name,
						professionalName: professional.name,
						startsAt,
						durationMinutes: duration,
						type: type.data,
						label,
						studentId,
						linkTokenVersion: student.linkTokenVersion,
						variant: cancelledNow ? 'cancelada' : 'remarcada'
					}).catch((err) =>
						logger.error({ err: String(err).slice(0, 200) }, 'appointment.notify.send_failed')
					);
					// Sem waitUntil a serverless function congela no redirect e a
					// Promise órfã pode nunca enviar o email (C09).
					try {
						waitUntil(emailPromise);
					} catch {
						// Fora do contexto Vercel (ex: dev local): waitUntil lança.
						// Promise continua rodando porque Node não termina.
					}
				}
			} catch (err) {
				logger.error({ err: String(err).slice(0, 200) }, 'appointment.notify.lookup_failed');
			}
		}

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
