/**
 * Pipeline de processamento do vídeo da hero:
 *
 * 1. Upscale 720p → 1080p com filtro Lanczos (preserva detalhes
 *    melhor que bicúbico, sem artifacts de supersampling)
 * 2. Re-encode H.264 high profile, CRF 18 (visualmente lossless)
 * 3. Tune film + slow preset (compression eficiente pra gradientes)
 * 4. yuv420p pra compatibilidade Safari/iOS
 * 5. movflags +faststart pra streaming progressivo
 * 6. Sem áudio (já era silent)
 *
 * Roda: node scripts/process-hero-video.js
 *
 * Input:  static/hero.mp4  (atual: 1280x720, 4.7MB)
 * Output: static/hero-1080.mp4 + static/hero.webm (VP9 fallback)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INPUT = resolve(ROOT, 'static/hero.mp4');
const OUT_MP4 = resolve(ROOT, 'static/hero-1080.mp4');
const OUT_WEBM = resolve(ROOT, 'static/hero.webm');

if (!existsSync(INPUT)) {
	console.error('✗ static/hero.mp4 não existe. Coloque o arquivo lá primeiro.');
	process.exit(1);
}

console.log(
	`→ Input: ${INPUT} (${(statSync(INPUT).size / 1024 / 1024).toFixed(2)}MB)\n`
);

function run(args, label) {
	return new Promise((resolveP, rejectP) => {
		console.log(`▸ ${label}`);
		const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let lastLine = '';
		proc.stderr.on('data', (chunk) => {
			const text = chunk.toString();
			// Pega só linhas de progresso pra mostrar
			const match = text.match(/frame=\s*(\d+).*?fps=\s*([\d.]+).*?time=([\d:.]+).*?bitrate=([\d.]+kbits)/);
			if (match) {
				lastLine = `  frame ${match[1]} · ${match[2]}fps · ${match[3]} · ${match[4]}/s`;
				process.stdout.write(`\r${lastLine}     `);
			}
		});
		proc.on('close', (code) => {
			process.stdout.write('\n');
			if (code === 0) resolveP();
			else rejectP(new Error(`ffmpeg exited ${code}`));
		});
	});
}

const upscale = [
	'-y',
	'-i', INPUT,
	// Filtro: scale 1920x1080 com Lanczos (sharper que bicubic)
	// + unsharp pra dar uma "afiada" leve nos detalhes upscalados
	// + format yuv420p pra compatibilidade
	'-vf', 'scale=1920:1080:flags=lanczos,unsharp=5:5:0.6:5:5:0.0,format=yuv420p',
	'-c:v', 'libx264',
	'-preset', 'slow',         // compression mais eficiente
	'-crf', '18',              // ~visualmente lossless
	'-tune', 'film',           // melhor pra animação 3D / gradientes
	'-profile:v', 'high',
	'-level', '4.2',
	'-pix_fmt', 'yuv420p',
	'-movflags', '+faststart', // streaming progressivo
	'-an',                     // sem audio
	'-r', '30',
	OUT_MP4
];

const webm = [
	'-y',
	'-i', INPUT,
	'-vf', 'scale=1920:1080:flags=lanczos,unsharp=5:5:0.6:5:5:0.0',
	'-c:v', 'libvpx-vp9',
	'-b:v', '0',               // CRF mode
	'-crf', '32',              // VP9 CRF é diferente — 32 ≈ H.264 CRF 18
	'-row-mt', '1',
	'-deadline', 'good',
	'-cpu-used', '2',
	'-pix_fmt', 'yuv420p',
	'-an',
	'-r', '30',
	OUT_WEBM
];

console.log('═══ Stage 1/2: H.264 1080p (Lanczos upscale + CRF 18) ═══');
await run(upscale, 'Re-encoding to 1080p H.264...');

console.log('\n═══ Stage 2/2: VP9 WebM fallback (Chrome/FF preferem) ═══');
await run(webm, 'Encoding WebM VP9...');

const mp4Size = statSync(OUT_MP4).size;
const webmSize = statSync(OUT_WEBM).size;
const origSize = statSync(INPUT).size;

console.log('\n═══ Done ═══');
console.log(`  hero.mp4 (original):  ${(origSize / 1024 / 1024).toFixed(2)}MB · 1280x720`);
console.log(`  hero-1080.mp4 (novo): ${(mp4Size / 1024 / 1024).toFixed(2)}MB · 1920x1080`);
console.log(`  hero.webm:            ${(webmSize / 1024 / 1024).toFixed(2)}MB · 1920x1080`);
console.log('\n✓ Atualize <video> em src/routes/+page.svelte:');
console.log('   <source src="/hero.webm" type="video/webm">');
console.log('   <source src="/hero-1080.mp4" type="video/mp4">');
