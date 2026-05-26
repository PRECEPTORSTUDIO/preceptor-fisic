import { error, fail, redirect } from '@sveltejs/kit';
import { getAlunoAppData, logTrainingSession, matchCatalogByName } from '$lib/server/queries';
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

	// Match cada exercício do treino contra o catálogo (fuzzy por nome).
	// Resultado: videoMap { nomeDoExercicio → { videoUrl, instructions } }
	// pra exibir o tutorial em vídeo durante a execução.
	const allExercises = [
		...(session.warmup ?? []),
		...(session.main ?? []),
		...(session.cooldown ?? [])
	];
	const uniqueNames = [...new Set(allExercises.map((e) => e.name).filter(Boolean))];
	const videoMap: Record<string, { videoUrl: string | null; instructions: string[] }> = {};
	await Promise.all(
		uniqueNames.map(async (name) => {
			const match = await matchCatalogByName(name);
			if (match) {
				videoMap[name] = { videoUrl: match.videoUrl, instructions: match.instructions };
			}
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
