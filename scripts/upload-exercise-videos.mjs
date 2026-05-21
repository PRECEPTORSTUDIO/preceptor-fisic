/**
 * Sobe os MP4 dos exercícios pro Supabase Storage.
 *
 * Bucket: exercise-videos (público, cache longo)
 * Cada arquivo: {externalId}.mp4 → URL pública previsível.
 *
 * Idempotente: pula arquivos já enviados (upsert).
 *
 * Roda: node scripts/upload-exercise-videos.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('✗ PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY faltando no .env.local');
	process.exit(1);
}

const MP4_DIR =
	'C:/Users/Matheus/Documents/fisiomentor/.claude/worktrees/pedantic-mcclintock-94f3da/exerciseDBpro/mp4';
const BUCKET = 'exercise-videos';
const CONCURRENCY = 6;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { persistSession: false }
});

// 1. Garante que o bucket existe (público, cache 1 ano)
const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
	console.log(`▸ criando bucket "${BUCKET}"…`);
	const { error } = await sb.storage.createBucket(BUCKET, {
		public: true,
		fileSizeLimit: 5 * 1024 * 1024, // 5MB por vídeo (folga)
		allowedMimeTypes: ['video/mp4']
	});
	if (error && !error.message.includes('already exists')) {
		console.error('✗ erro criando bucket:', error.message);
		process.exit(1);
	}
}

// 2. Lista o que já está no bucket pra pular (idempotência)
const existing = new Set();
let offset = 0;
for (;;) {
	const { data, error } = await sb.storage.from(BUCKET).list('', { limit: 1000, offset });
	if (error) break;
	if (!data || data.length === 0) break;
	for (const f of data) existing.add(f.name);
	if (data.length < 1000) break;
	offset += 1000;
}
console.log(`▸ ${existing.size} vídeos já no bucket`);

// 3. Upload
const files = readdirSync(MP4_DIR).filter((f) => f.endsWith('.mp4'));
console.log(`▸ ${files.length} MP4s locais\n`);

let done = 0;
let skipped = 0;
let failed = 0;
const startMs = Date.now();

async function uploadOne(file) {
	if (existing.has(file)) {
		skipped++;
		return;
	}
	try {
		const buf = readFileSync(join(MP4_DIR, file));
		const { error } = await sb.storage.from(BUCKET).upload(file, buf, {
			contentType: 'video/mp4',
			cacheControl: '31536000', // 1 ano — vídeos são imutáveis
			upsert: true
		});
		if (error) {
			failed++;
			console.error(`  ✗ ${file}: ${error.message}`);
		} else {
			done++;
		}
	} catch (err) {
		failed++;
		console.error(`  ✗ ${file}: ${String(err).slice(0, 100)}`);
	}
	const total = done + skipped + failed;
	if (total % 100 === 0 || total === files.length) {
		const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
		process.stdout.write(
			`\r  ${total}/${files.length} · ${done} up · ${skipped} skip · ${failed} fail · ${elapsed}s   `
		);
	}
}

let cursor = 0;
async function worker() {
	while (cursor < files.length) {
		await uploadOne(files[cursor++]);
	}
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n\n✓ Upload concluído: ${done} enviados, ${skipped} já existiam, ${failed} falhas`);
console.log(
	`  URL pública: ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/{id}.mp4`
);
