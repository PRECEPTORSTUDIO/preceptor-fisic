import { error } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import { getAlunoAppData, getAlunoUnreadCount } from '$lib/server/queries';
import { db } from '$lib/server/db';
import { exerciseCatalog } from '$lib/server/db/schema';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	const tokenValid = await verifyStudentAccess(params.id, token);
	if (!tokenValid && !alunoDevBypass()) {
		error(403, 'link inválido ou expirado — peça pro seu treinador um novo link.');
	}

	const data = await getAlunoAppData(params.id);
	if (!data) error(404, 'aluno não encontrado');

	// Pre-fetch vídeos do plano todo (todas sessões) por catalog_id — 1 batch
	// query. UI mostra strip de thumbnails na card "Treino de Hoje" e
	// (potencialmente) nas cards de sessão. Indexado por catalog_id → videoUrl.
	const videoByCatalogId: Record<string, string> = {};
	if (data.plan?.planData?.weekly_sessions) {
		const ids = new Set<string>();
		for (const s of data.plan.planData.weekly_sessions) {
			for (const block of [s.warmup ?? [], s.main ?? [], s.cooldown ?? []]) {
				for (const ex of block) {
					const cid = (ex as { catalog_id?: string }).catalog_id;
					if (cid && /^\d{4,5}$/.test(cid)) ids.add(cid);
				}
			}
		}
		if (ids.size > 0) {
			try {
				const rows = await db
					.select({ externalId: exerciseCatalog.externalId, videoUrl: exerciseCatalog.videoUrl })
					.from(exerciseCatalog)
					.where(inArray(exerciseCatalog.externalId, [...ids]));
				for (const r of rows) if (r.videoUrl) videoByCatalogId[r.externalId] = r.videoUrl;
			} catch (err) {
				console.error('home.video_lookup.failed', String(err).slice(0, 200));
			}
		}
	}

	const unreadMessages = await getAlunoUnreadCount(params.id);

	return { ...data, tokenValid, videoByCatalogId, unreadMessages };
}) satisfies PageServerLoad;
