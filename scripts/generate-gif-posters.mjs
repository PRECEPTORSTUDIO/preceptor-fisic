/**
 * Gera posters (1º frame JPG) de cada GIF e sobe pro Storage.
 *
 * Por quê: catálogo /exercicios renderiza 1324 <img src=".gif">. Browsers
 * autoplay GIFs ao colocá-los no DOM — 1324 animações simultâneas = CPU
 * explode + ~2.3GB de download. Solução: mostra JPG estático (~30KB cada,
 * ~40MB total) por padrão; UI troca pra GIF só quando o user clica.
 *
 * Idempotente. Roda local: node scripts/generate-gif-posters.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import sharp from 'sharp';
config({ path: '.env.local' });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('✗ env faltando');
	process.exit(1);
}

const GIFS_DIR = 'data/gifs';
const BUCKET = 'exercise-videos';
const CONCURRENCY = 6;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const files = readdirSync(GIFS_DIR).filter((f) => f.endsWith('.gif'));
console.log(`▸ ${files.length} GIFs em ${GIFS_DIR}`);

let done = 0, failed = 0;
const startMs = Date.now();

async function processOne(file) {
	const externalId = file.replace('.gif', '');
	const jpgName = `${externalId}.jpg`;
	try {
		const gifBuf = readFileSync(join(GIFS_DIR, file));
		// sharp lê o GIF, pega frame 0 (default), converte pra JPG.
		// Resize pra 480px máx (suficiente pra cards) reduz storage 3-4x.
		const jpgBuf = await sharp(gifBuf, { animated: false })
			.resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 78, mozjpeg: true })
			.toBuffer();
		const { error } = await sb.storage.from(BUCKET).upload(jpgName, jpgBuf, {
			contentType: 'image/jpeg',
			cacheControl: '31536000',
			upsert: true
		});
		if (error) {
			failed++;
			console.error(`\n  ✗ ${jpgName}: ${error.message.slice(0, 100)}`);
		} else {
			done++;
		}
	} catch (err) {
		failed++;
		console.error(`\n  ✗ ${file}: ${String(err).slice(0, 100)}`);
	}
	if ((done + failed) % 50 === 0) {
		const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
		const rate = (done + failed) / Math.max(1, Date.now() - startMs) * 1000;
		const eta = Math.round((files.length - done - failed) / Math.max(0.1, rate));
		process.stdout.write(`\r  ${done + failed}/${files.length} · ↑${done} err${failed} · ${elapsed}s · eta ${eta}s   `);
	}
}

async function runPool(items, n, fn) {
	const queue = [...items];
	const workers = Array.from({ length: n }, async () => {
		while (queue.length > 0) {
			const item = queue.shift();
			if (item === undefined) break;
			await fn(item);
		}
	});
	await Promise.all(workers);
}

// Sharp pode habilitar mime image/jpeg no bucket — checa allowed_mime_types
const meta = await sb.storage.getBucket(BUCKET);
const allowed = meta.data?.allowed_mime_types ?? [];
if (!allowed.includes('image/jpeg')) {
	console.log('▸ Adicionando image/jpeg ao bucket...');
	await sb.storage.updateBucket(BUCKET, {
		public: true,
		fileSizeLimit: meta.data?.fileSizeLimit ?? undefined,
		allowedMimeTypes: [...allowed, 'image/jpeg']
	});
}

await runPool(files, CONCURRENCY, processOne);
console.log(`\n\n✓ Posters: ${done} ok, ${failed} falhas`);
