/**
 * Ingere o ExerciseDB Pro no exercise_catalog.
 *
 * Passos:
 *  1. Lê exerciseData_complete.json (1.324 exercícios em EN)
 *  2. Traduz name + description + instructions pra PT-BR via Gemini Flash
 *     (em batches de 20, structured output)
 *  3. Insere/atualiza no exercise_catalog (upsert por external_id)
 *  4. video_url é determinístico: {SUPABASE_URL}/storage/.../{id}.mp4
 *
 * Idempotente: re-rodar atualiza. Pra pular tradução (re-ingest rápido),
 * passa --skip-translation (usa EN como PT-BR temporariamente).
 *
 * Roda: node scripts/ingest-exercise-catalog.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('✗ Supabase env faltando');
	process.exit(1);
}

const SKIP_TRANSLATION = process.argv.includes('--skip-translation');
const JSON_PATH =
	'C:/Users/Matheus/Documents/fisiomentor/.claude/worktrees/pedantic-mcclintock-94f3da/exerciseDBpro/exerciseData_complete.json';
const BUCKET = 'exercise-videos';
const TRANSLATE_BATCH = 20;
const MODEL = process.env.AI_MODEL_FAST ?? 'gemini-2.5-flash';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const raw = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
console.log(`▸ ${raw.length} exercícios no JSON`);

// ── Tradução em batch ──
const translationSchema = z.object({
	items: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string(),
			instructions: z.array(z.string())
		})
	)
});

async function translateBatch(batch) {
	if (SKIP_TRANSLATION || !GEMINI_KEY) {
		return batch.map((e) => ({
			id: e.id,
			name: e.name,
			description: e.description ?? '',
			instructions: e.instructions ?? []
		}));
	}
	const payload = batch.map((e) => ({
		id: e.id,
		name: e.name,
		description: e.description ?? '',
		instructions: e.instructions ?? []
	}));
	const { object } = await generateObject({
		model: google(MODEL),
		schema: translationSchema,
		system:
			'Você traduz dados de exercícios físicos de inglês para português do Brasil. ' +
			'Use terminologia técnica de educação física brasileira (ex: "barbell" = "barra", ' +
			'"dumbbell" = "halter", "cable" = "polia/cabo", "deadlift" = "levantamento terra", ' +
			'"squat" = "agachamento", "bench press" = "supino"). Mantenha o id EXATO. ' +
			'Traduza name, description e cada item de instructions. Tom: instrutivo, claro, ' +
			'direto. Sem emoji. Mantenha números de passo se houver.',
		prompt:
			'Traduza estes exercícios pra PT-BR, devolvendo o mesmo array com id intacto:\n\n' +
			JSON.stringify(payload),
		maxRetries: 2
	});
	return object.items;
}

// ── Loop principal ──
let translated = 0;
let upserted = 0;
let failed = 0;
const startMs = Date.now();

for (let i = 0; i < raw.length; i += TRANSLATE_BATCH) {
	const batch = raw.slice(i, i + TRANSLATE_BATCH);
	let trMap = new Map();
	try {
		const tr = await translateBatch(batch);
		for (const t of tr) trMap.set(t.id, t);
		translated += tr.length;
	} catch (err) {
		console.error(`\n  ✗ tradução batch ${i}: ${String(err).slice(0, 120)}`);
		// fallback: usa EN
		for (const e of batch) {
			trMap.set(e.id, {
				id: e.id,
				name: e.name,
				description: e.description ?? '',
				instructions: e.instructions ?? []
			});
		}
	}

	// Monta rows e faz upsert
	const rows = batch.map((e) => {
		const t = trMap.get(e.id) ?? {};
		return {
			external_id: e.id,
			name: t.name ?? e.name,
			name_en: e.name,
			body_part: e.bodyPart,
			target_muscle: e.target,
			secondary_muscles: e.secondaryMuscles ?? [],
			equipment: e.equipment ?? null,
			difficulty: e.difficulty ?? null,
			category: e.category ?? null,
			instructions: t.instructions ?? e.instructions ?? [],
			instructions_en: e.instructions ?? [],
			description: t.description ?? e.description ?? null,
			video_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${e.id}.mp4`
		};
	});

	const { error } = await sb.from('exercise_catalog').upsert(rows, { onConflict: 'external_id' });
	if (error) {
		failed += rows.length;
		console.error(`\n  ✗ upsert batch ${i}: ${error.message}`);
	} else {
		upserted += rows.length;
	}

	const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
	process.stdout.write(
		`\r  ${Math.min(i + TRANSLATE_BATCH, raw.length)}/${raw.length} · ${translated} traduzidos · ${upserted} no DB · ${elapsed}s   `
	);
}

console.log(`\n\n✓ Ingest concluído: ${upserted} no exercise_catalog, ${failed} falhas`);
if (SKIP_TRANSLATION) console.log('  ⚠ tradução pulada (--skip-translation) — nomes em EN');
