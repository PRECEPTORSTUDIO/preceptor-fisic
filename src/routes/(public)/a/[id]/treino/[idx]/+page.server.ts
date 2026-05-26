import { error, fail, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import {
	getAlunoAppData,
	logTrainingSession,
	matchCatalogByName
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { exerciseCatalog } from '$lib/server/db/schema';
import { verifyStudentToken } from '$lib/server/aluno-token';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!verifyStudentToken(params.id, token) && !dev) {
		error(403, 'link inválido ou expirado.');
	}

	const data = await getAlunoAppData(params.id);
	if (!data || !data.plan) error(404, 'plano não encontrado');

	const idx = Number(params.idx);
	const session = data.plan.planData.weekly_sessions?.[idx];
	if (!session) error(404, 'sessão não encontrada');

	// Resolve vídeo de cada exercício em DUAS passadas:
	// 1) catalog_id direto (a IA agora emite external_id exato) — 1 query batch
	// 2) fuzzy por nome pros que ficaram sem match (compat com planos antigos
	//    + exercícios genéricos tipo "Caminhada rápida" sem id no catálogo)
	const allExercises = [
		...(session.warmup ?? []),
		...(session.main ?? []),
		...(session.cooldown ?? [])
	];
	const videoMap: Record<string, { videoUrl: string | null; instructions: string[] }> = {};

	// Passada 1: catalog_id em batch
	const catalogIds = [
		...new Set(
			allExercises
				.map((e) => (e as { catalog_id?: string }).catalog_id)
				.filter((id): id is string => typeof id === 'string' && /^\d{4,5}$/.test(id))
		)
	];
	if (catalogIds.length > 0) {
		const rows = await db
			.select({
				externalId: exerciseCatalog.externalId,
				videoUrl: exerciseCatalog.videoUrl,
				instructions: exerciseCatalog.instructions
			})
			.from(exerciseCatalog)
			.where(inArray(exerciseCatalog.externalId, catalogIds));
		const byExternal = new Map(rows.map((r) => [r.externalId, r]));
		for (const ex of allExercises) {
			const cid = (ex as { catalog_id?: string }).catalog_id;
			if (cid && byExternal.has(cid)) {
				const c = byExternal.get(cid)!;
				videoMap[ex.name] = { videoUrl: c.videoUrl, instructions: c.instructions ?? [] };
			}
		}
	}

	// Passada 2: fuzzy pros nomes que sobraram (sem catalog_id ou id que não casou)
	const missing = [
		...new Set(
			allExercises.map((e) => e.name).filter((n) => n && !videoMap[n])
		)
	];
	await Promise.all(
		missing.map(async (name) => {
			const match = await matchCatalogByName(name);
			if (match) videoMap[name] = { videoUrl: match.videoUrl, instructions: match.instructions };
		})
	);

	return { ...data, sessionIdx: idx, session, videoMap };
}) satisfies PageServerLoad;

export const actions: Actions = {
	complete: async ({ request, params, url }) => {
		const data = await getAlunoAppData(params.id);
		if (!data || !data.plan) return fail(404, { error: 'plano não encontrado' });
		const idx = Number(params.idx);
		const session = data.plan.planData.weekly_sessions?.[idx];
		if (!session) return fail(404, { error: 'sessão não encontrada' });

		const fd = await request.formData();
		const exerciseLogs = (session.main ?? []).map((ex, i) => ({
			exercise_id: `${data.plan!.id}-${idx}-${i}`,
			name: ex.name,
			sets_done: Number(fd.get(`sets_${i}`) ?? ex.sets ?? 0),
			reps_done: String(fd.get(`reps_${i}`) ?? ex.reps ?? '—'),
			load_used: String(fd.get(`load_${i}`) ?? '').trim() || undefined,
			notes: undefined,
			completed: fd.get(`completed_${i}`) === 'on'
		}));
		const rpeRaw = fd.get('rpe');
		const perceivedEffort = rpeRaw ? Number(rpeRaw) : undefined;
		const observations = String(fd.get('observations') ?? '').trim() || undefined;

		await logTrainingSession({
			studentId: params.id!,
			planId: data.plan.id,
			professionalId: data.professional.id,
			sessionLabel: session.label ?? `Sessão ${idx + 1}`,
			exerciseLogs,
			perceivedEffort,
			observations
		});

		// Preserva token na URL após redirect
		const tokenParam = url.searchParams.get('t');
		const tq = tokenParam ? `?t=${tokenParam}&just_completed=1` : '?just_completed=1';
		redirect(303, `/a/${params.id}${tq}`);
	}
};
