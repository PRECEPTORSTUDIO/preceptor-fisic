import { error, fail, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import { getAlunoAppData, logTrainingSession, matchCatalogByName } from '$lib/server/queries';
import { db } from '$lib/server/db';
import { exerciseCatalog } from '$lib/server/db/schema';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
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
	const missing = [...new Set(allExercises.map((e) => e.name).filter((n) => n && !videoMap[n]))];
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
		// Token vem via hidden input do form (action URL não preserva a query
		// string ?t=). Sem isso o redirect no fim cai em /a/[id] sem token e
		// o load do app do aluno responde 403 logo após "concluir treino".
		const fd = await request.formData();
		const tokenFromForm = String(fd.get('_t') ?? '').trim() || null;
		if (!(await verifyStudentAccess(params.id!, tokenFromForm)) && !alunoDevBypass()) {
			return fail(403, { error: 'sessão expirou — abra o link de novo' });
		}

		const data = await getAlunoAppData(params.id);
		if (!data || !data.plan) return fail(404, { error: 'plano não encontrado' });
		const idx = Number(params.idx);
		const session = data.plan.planData.weekly_sessions?.[idx];
		if (!session) return fail(404, { error: 'sessão não encontrada' });
		const exerciseLogs = (session.main ?? []).map((ex, i) => {
			// Tipo do exercício (hidden kind_{i}, classifyExercise no front):
			// pra `time` o campo weight é SEGUNDOS — nunca pode virar "kg".
			const kindRaw = String(fd.get(`kind_${i}`) ?? 'weight');
			const kind = kindRaw === 'time' || kindRaw === 'bodyweight' ? kindRaw : 'weight';
			const unit: 'kg' | 's' = kind === 'time' ? 's' : 'kg';

			// set_logs: peso/reps reais por série (JSON enviado pelo front).
			// Cada série vira { weight, reps }; vazias (sem peso E sem reps) são descartadas.
			let setLogs: { weight: number; reps: number }[] = [];
			try {
				const raw = JSON.parse(String(fd.get(`setlogs_${i}`) ?? '[]')) as Array<{
					weight?: string;
					reps?: string;
				}>;
				setLogs = raw
					.map((r) => ({
						weight: Number(String(r.weight ?? '').replace(',', '.')) || 0,
						reps: parseInt(String(r.reps ?? ''), 10) || 0
					}))
					.filter((r) => r.weight > 0 || r.reps > 0);
			} catch {
				setLogs = [];
			}

			// `|| 0` no fim garante que um sets_i não-numérico vire 0 (e não NaN,
			// que serializaria como null no JSON da sessão).
			const setsDone = setLogs.length || Number(fd.get(`sets_${i}`) ?? ex.sets ?? 0) || 0;
			// Resumo legível: reps reais ("10,10,8") e maior peso usado.
			const repsSummary = setLogs.length
				? setLogs.map((s) => s.reps).join(',')
				: String(fd.get(`reps_${i}`) ?? ex.reps ?? '—');
			const maxWeight = setLogs.reduce((m, s) => Math.max(m, s.weight), 0);

			// #1 — % da carga máxima usada hoje (informado pelo aluno, opcional).
			// Aceita só 1–100; fora disso ignora.
			const pctRaw = Number(String(fd.get(`pct_${i}`) ?? '').replace(',', '.'));
			const intensityUsed =
				Number.isFinite(pctRaw) && pctRaw > 0 && pctRaw <= 100 ? Math.round(pctRaw) : undefined;

			return {
				exercise_id: `${data.plan!.id}-${idx}-${i}`,
				name: ex.name,
				sets_done: setsDone,
				reps_done: repsSummary,
				// `time` → "45s" (segundos), nunca "kg" — senão a duração polui a tonelagem.
				load_used: maxWeight > 0 ? `${maxWeight}${unit}` : undefined,
				set_logs: setLogs.length ? setLogs.map((s) => ({ ...s, unit })) : undefined,
				intensity_used: intensityUsed,
				notes: undefined,
				// Série com log preenchido = trabalho feito, mesmo sem o toque em
				// "concluído" (aluno esquece; as métricas não podem descartar).
				completed: fd.get(`completed_${i}`) === 'on' || setLogs.length > 0
			};
		});
		// rpe não-numérico (NaN) iria parar na coluna integer perceived_effort
		// (erro do Postgres → 500). Só aceita 0–10; senão fica undefined.
		const rpeNum = fd.get('rpe') ? Number(fd.get('rpe')) : NaN;
		const perceivedEffort = Number.isFinite(rpeNum)
			? Math.min(10, Math.max(0, Math.round(rpeNum)))
			: undefined;
		const observations = String(fd.get('observations') ?? '').trim() || undefined;

		// Duração: cliente envia minutos decorridos (start no mount → submit).
		// Clampa pra faixa plausível; fora disso usa estimativa do plano ou
		// das séries (cada série ~3.5min incluindo descanso).
		const elapsedRaw = Number(fd.get('duration_minutes') ?? 0);
		const plannedDuration = session.duration_minutes ?? null;
		const totalSets = (session.main ?? []).reduce((acc, ex) => acc + (Number(ex.sets) || 3), 0);
		const setsEstimate = Math.round(totalSets * 3.5);
		let durationMinutes: number | undefined;
		if (Number.isFinite(elapsedRaw) && elapsedRaw >= 5 && elapsedRaw <= 180) {
			durationMinutes = Math.round(elapsedRaw);
		} else if (plannedDuration && plannedDuration >= 5) {
			durationMinutes = plannedDuration;
		} else if (setsEstimate >= 5) {
			durationMinutes = Math.min(setsEstimate, 180);
		}

		await logTrainingSession({
			studentId: params.id!,
			planId: data.plan.id,
			professionalId: data.professional.id,
			sessionLabel: session.label ?? `Sessão ${idx + 1}`,
			exerciseLogs,
			perceivedEffort,
			durationMinutes,
			observations
		});

		// Preserva token na URL após redirect — pega do form (hidden _t)
		// porque a URL do form POST (?/complete) já perdeu a query string.
		const tq = tokenFromForm ? `?t=${tokenFromForm}&just_completed=1` : '?just_completed=1';
		redirect(303, `/a/${params.id}${tq}`);
	}
};
