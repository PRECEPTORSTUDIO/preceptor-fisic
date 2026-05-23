/**
 * Polling endpoint pra UI acompanhar geração de plano em background.
 * Frontend chama a cada ~1.2s enquanto status != 'generated'/'failed'.
 *
 * Retorna planData PARCIAL durante o streaming pro UI renderizar
 * sessões que vão aparecendo em tempo real.
 */
import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { trainingPlans } from '$lib/server/db/schema';
import { failIfStale } from '$lib/server/ai/generator';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401);

	const [row] = await db
		.select({
			id: trainingPlans.id,
			status: trainingPlans.status,
			progressPct: trainingPlans.progressPct,
			progressPhase: trainingPlans.progressPhase,
			errorMessage: trainingPlans.errorMessage,
			generatedAt: trainingPlans.generatedAt,
			planData: trainingPlans.planData,
			streamText: trainingPlans.streamText,
			updatedAt: trainingPlans.updatedAt
		})
		.from(trainingPlans)
		.where(eq(trainingPlans.id, params.id!))
		.limit(1);

	if (!row) error(404, 'plano não encontrado');

	// Watchdog: se o plano está pending/generating há mais de 3min, a função
	// serverless morreu no meio. Reconcilia pra failed pra encerrar o polling
	// no cliente em vez de spinner infinito.
	const stale = await failIfStale(row);
	const status = stale?.status ?? row.status;
	const errorMessage = stale?.errorMessage ?? row.errorMessage;

	return json({
		id: row.id,
		status,
		progress: stale ? 0 : row.progressPct,
		phase: stale ? 'erro' : row.progressPhase,
		error: errorMessage,
		generated: status === 'generated' || status === 'published',
		failed: status === 'failed',
		// Partial planData durante streaming — o UI renderiza sessões/restrições à medida que chegam
		partial: row.planData ?? null,
		// Texto bruto da IA em streaming (alimenta UI "Gemini escrevendo")
		streamText: row.streamText ?? null
	});
};
