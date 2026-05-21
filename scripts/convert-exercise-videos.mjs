/**
 * Converte os GIFs do ExerciseDB Pro (720p) para MP4 H.264.
 *
 * Por que MP4 H.264 e não WebM VP9:
 *  - Encoda 5-10x mais rápido (1.394 arquivos em ~15min vs ~60min)
 *  - Suporte universal (todo browser + iOS/Android)
 *  - ~8x menor que o GIF original
 *
 * Input:  <worktree>/exerciseDBpro/720/*.gif
 * Output: <worktree>/exerciseDBpro/mp4/*.mp4
 *
 * Roda: node scripts/convert-exercise-videos.mjs
 */
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

const SRC = 'C:/Users/Matheus/Documents/fisiomentor/.claude/worktrees/pedantic-mcclintock-94f3da/exerciseDBpro/720';
const OUT = 'C:/Users/Matheus/Documents/fisiomentor/.claude/worktrees/pedantic-mcclintock-94f3da/exerciseDBpro/mp4';

mkdirSync(OUT, { recursive: true });

const gifs = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.gif'));
console.log(`→ ${gifs.length} GIFs pra converter\n`);

const CONCURRENCY = 4; // 4 ffmpeg em paralelo
let done = 0;
let skipped = 0;
let failed = 0;
const startMs = Date.now();

function convertOne(gif) {
	return new Promise((resolve) => {
		const id = gif.replace(/\.gif$/i, '');
		const outFile = join(OUT, `${id}.mp4`);

		// Já existe e não-vazio? pula (permite retomar)
		if (existsSync(outFile) && statSync(outFile).size > 1000) {
			skipped++;
			resolve();
			return;
		}

		const args = [
			'-y',
			'-i', join(SRC, gif),
			// scale pra largura par (H.264 exige dimensões pares)
			'-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos',
			'-c:v', 'libx264',
			'-preset', 'veryfast',
			'-crf', '30',
			'-pix_fmt', 'yuv420p',
			'-movflags', '+faststart',
			'-an',
			outFile
		];
		const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
		proc.on('close', (code) => {
			if (code === 0) done++;
			else {
				failed++;
				console.error(`  ✗ falhou: ${gif} (exit ${code})`);
			}
			const total = done + skipped + failed;
			if (total % 100 === 0 || total === gifs.length) {
				const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
				process.stdout.write(
					`\r  ${total}/${gifs.length} · ${done} ok · ${skipped} skip · ${failed} fail · ${elapsed}s   `
				);
			}
			resolve();
		});
	});
}

// Pool de concorrência
let cursor = 0;
async function worker() {
	while (cursor < gifs.length) {
		const i = cursor++;
		await convertOne(gifs[i]);
	}
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n\n✓ Concluído: ${done} convertidos, ${skipped} já existiam, ${failed} falhas`);
console.log(`  Output: ${OUT}`);
