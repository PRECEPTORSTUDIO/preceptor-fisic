/**
 * Backfill RPE → PSE nos planos já gravados.
 *
 * Contexto: a nomenclatura passou de "RPE" pra "PSE" (Percepção Subjetiva de
 * Esforço, termo PT-BR). Planos antigos têm a carga gravada como "RPE 6-7" no
 * `plan_data` (e eventualmente em plan_summary/restrictions/monitoring_notes).
 * Este script reescreve a palavra inteira `RPE` → `PSE` nesses campos.
 *
 * Seguro/idempotente: usa word-boundary `\bRPE\b`, então NÃO toca em "sRPE" /
 * "session-RPE" (que só existem em código, não no plan_data). Rodar de novo num
 * banco já migrado não altera nada.
 *
 * Uso:
 *   tsx scripts/migrate-rpe-to-pse.ts            # dry-run (só mostra o que mudaria)
 *   tsx scripts/migrate-rpe-to-pse.ts --apply    # aplica as mudanças
 */
import 'dotenv/config';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_DIRECT ou DATABASE_URL não está setado.');

const sql = postgres(url, { max: 1, prepare: false });

const RPE_RE = /\bRPE\b/g;

/** Reescreve RPE→PSE em qualquer valor (string/objeto/array) preservando estrutura. */
function rewrite<T>(value: T): { value: T; changed: boolean } {
	if (value == null) return { value, changed: false };
	const json = JSON.stringify(value);
	if (!RPE_RE.test(json)) return { value, changed: false };
	const replaced = json.replace(RPE_RE, 'PSE');
	return { value: JSON.parse(replaced) as T, changed: true };
}

const rows = await sql<
	Array<{
		id: string;
		plan_data: unknown;
		plan_summary: string | null;
		restrictions: unknown;
		monitoring_notes: unknown;
	}>
>`
	SELECT id, plan_data, plan_summary, restrictions, monitoring_notes
	FROM training_plans
`;

console.log(`${rows.length} planos no total. Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

let touched = 0;
for (const r of rows) {
	const planData = rewrite(r.plan_data);
	const summary = rewrite(r.plan_summary);
	const restrictions = rewrite(r.restrictions);
	const monitoring = rewrite(r.monitoring_notes);

	const changed = planData.changed || summary.changed || restrictions.changed || monitoring.changed;
	if (!changed) continue;

	touched++;
	const fields = [
		planData.changed && 'plan_data',
		summary.changed && 'plan_summary',
		restrictions.changed && 'restrictions',
		monitoring.changed && 'monitoring_notes'
	].filter(Boolean);
	console.log(`  - ${r.id} · campos: ${fields.join(', ')}`);

	if (APPLY) {
		await sql`
			UPDATE training_plans
			SET plan_data = ${sql.json(planData.value as object)},
			    plan_summary = ${summary.value},
			    restrictions = ${sql.json(restrictions.value as object)},
			    monitoring_notes = ${sql.json(monitoring.value as object)},
			    updated_at = now()
			WHERE id = ${r.id}
		`;
	}
}

console.log(
	`\n${APPLY ? '✓ Migrados' : 'Seriam migrados'} ${touched} planos.` +
		(APPLY ? '' : '  Rode com --apply pra aplicar.')
);
await sql.end();
