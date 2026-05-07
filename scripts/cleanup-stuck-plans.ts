/**
 * Marca como `failed` qualquer plano que esteja travado em `pending`/`generating`
 * há mais de 5 minutos. Causado pela bug do fire-and-forget que matava a Promise
 * quando a serverless function terminava o redirect (corrigido com waitUntil).
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_DIRECT ou DATABASE_URL não está setado.');

const sql = postgres(url, { max: 1, prepare: false });

const stuck = await sql<
	Array<{ id: string; status: string; created_at: Date; progress_phase: string | null }>
>`
	SELECT id, status, created_at, progress_phase
	FROM training_plans
	WHERE status IN ('pending', 'generating')
	  AND updated_at < now() - interval '5 minutes'
	ORDER BY created_at DESC
`;

console.log(`Encontrados ${stuck.length} planos travados:`);
for (const r of stuck) {
	const ageMin = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
	console.log(`  - ${r.id} · ${r.status} · "${r.progress_phase}" · ${ageMin}min atrás`);
}

if (stuck.length === 0) {
	console.log('Nada pra limpar.');
	await sql.end();
	process.exit(0);
}

const updated = await sql`
	UPDATE training_plans
	SET status = 'failed',
	    progress_pct = 0,
	    progress_phase = 'erro',
	    error_message = 'Geração interrompida (timeout serverless). Tente de novo.',
	    updated_at = now()
	WHERE status IN ('pending', 'generating')
	  AND updated_at < now() - interval '5 minutes'
	RETURNING id
`;

console.log(`\n✓ ${updated.length} planos marcados como failed.`);
await sql.end();
