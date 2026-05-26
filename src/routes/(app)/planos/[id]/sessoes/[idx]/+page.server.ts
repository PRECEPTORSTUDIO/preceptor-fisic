import { error } from '@sveltejs/kit';
import { getPlanDetail, getRecentSessionLogs, matchCatalogByName } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const plan = await getPlanDetail(params.id, professional.id);
	if (!plan) error(404, 'plano não encontrado');

	const idx = Number(params.idx);
	const session = plan.planData.weekly_sessions?.[idx];
	if (!session) error(404, 'sessão não encontrada');

	const sessionLabel = session.label ?? `Sessão ${idx + 1}`;

	// Match dos exercícios contra o catálogo (vídeo tutorial)
	const allExercises = [
		...(session.warmup ?? []),
		...(session.main ?? []),
		...(session.cooldown ?? [])
	];
	const uniqueNames = [...new Set(allExercises.map((e) => e.name).filter(Boolean))];
	const videoMap: Record<string, string> = {};
	const [recentLogs] = await Promise.all([
		getRecentSessionLogs(params.id, sessionLabel, 5),
		Promise.all(
			uniqueNames.map(async (name) => {
				const match = await matchCatalogByName(name);
				if (match?.videoUrl) videoMap[name] = match.videoUrl;
			})
		)
	]);

	return { plan, session, idx, recentLogs, videoMap };
}) satisfies PageServerLoad;
