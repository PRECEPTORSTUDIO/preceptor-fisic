import { error } from '@sveltejs/kit';
import { eq, desc, and, isNull, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { trainingSessions, students } from '$lib/server/db/schema';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
		error(403, 'link inválido.');
	}

	// isNull(deletedAt): aluno soft-deletado não pode continuar acessível
	// pelo link antigo (LGPD) — mesmo filtro de getAlunoAppData.
	const [s] = await db
		.select({ id: students.id, name: students.name })
		.from(students)
		.where(and(eq(students.id, params.id), isNull(students.deletedAt)))
		.limit(1);
	if (!s) error(404, 'aluno não encontrado');

	const sessions = await db
		.select()
		.from(trainingSessions)
		.where(eq(trainingSessions.studentId, params.id))
		.orderBy(desc(trainingSessions.sessionDate))
		.limit(50);

	// Total real (a lista acima é limitada às 50 mais recentes).
	const [countRow] = await db
		.select({ total: count() })
		.from(trainingSessions)
		.where(eq(trainingSessions.studentId, params.id));

	return {
		student: s,
		total: countRow?.total ?? sessions.length,
		sessions: sessions.map((row) => ({
			...row,
			sessionDate: row.sessionDate.toISOString()
		}))
	};
}) satisfies PageServerLoad;
