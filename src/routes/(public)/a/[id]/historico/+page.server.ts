import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { trainingSessions, students } from '$lib/server/db/schema';
import { verifyStudentToken } from '$lib/server/aluno-token';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!verifyStudentToken(params.id, token) && !dev) {
		error(403, 'link inválido.');
	}

	const [s] = await db
		.select({ id: students.id, name: students.name })
		.from(students)
		.where(eq(students.id, params.id))
		.limit(1);
	if (!s) error(404, 'aluno não encontrado');

	const sessions = await db
		.select()
		.from(trainingSessions)
		.where(eq(trainingSessions.studentId, params.id))
		.orderBy(desc(trainingSessions.sessionDate))
		.limit(50);

	return {
		student: s,
		sessions: sessions.map((row) => ({
			...row,
			sessionDate: row.sessionDate.toISOString()
		}))
	};
}) satisfies PageServerLoad;
