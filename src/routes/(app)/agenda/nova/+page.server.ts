import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import {
	getProfessionalByAuthId,
	getStudentsByProfessional,
	createAppointment
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { students } from '$lib/server/db/schema';
import { sendAppointmentNotification } from '$lib/server/email';
import { logger } from '$lib/server/logger';
import { isUuid } from '$lib/server/validation';
import { parseLocalDateTime } from '$lib/server/tz';
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
		if (studentId && !isUuid(studentId)) return fail(400, { error: 'aluno inválido' });
		const type = TypeEnum.safeParse(typeRaw);
		if (!type.success) return fail(400, { error: 'tipo inválido' });

		// Parse como horário de Brasília — new Date('...T...') no server (Vercel
		// = UTC) deslocaria tudo em 3h (C29).
		const startsAt = parseLocalDateTime(`${date}T${time}`);
		if (!startsAt) return fail(400, { error: 'data inválida' });
		// NaN passa em (NaN<15 || NaN>240) — ambos false — e vai parar numa
		// coluna integer NOT NULL (erro do Postgres → 500). Exige número válido.
		if (!Number.isFinite(duration) || duration < 15 || duration > 240)
			return fail(400, { error: 'duração inválida' });
		// Typo de ano (2025 em vez de 2026) criaria sessão invisível na agenda
		// (load só mostra a semana atual) e dispararia email de sessão passada.
		// Tolerância de 24h preserva registrar uma sessão feita hoje mais cedo.
		if (startsAt.getTime() < Date.now() - 24 * 60 * 60 * 1000)
			return fail(400, { error: 'a data da sessão está no passado — confira o ano e o dia' });

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
						linkTokenVersion: student.linkTokenVersion
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
	}
};
