import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// maxDuration = teto da função na Vercel. 300s (máx do plano Pro) pra
		// a geração de plano TERMINAR completa mesmo em paciente complexo —
		// antes, com 60s, a IA não fechava o plano inteiro e caía em falha.
		// O `export const config` por rota só vale com adapter split; aqui o
		// adapter empacota tudo numa função só, então setamos global.
		// IMPORTANTE: 300 exige plano Vercel Pro. No Hobby o teto é 60 e o
		// deploy falha se passar disso — nesse caso, voltar pra 60.
		adapter: adapter({ regions: ['gru1'], runtime: 'nodejs22.x', maxDuration: 300 }),
		alias: {
			$lib: './src/lib'
		},
		// CSP com nonce por request (mode auto): scripts inline só executam com
		// o nonce que o Kit injeta — substitui o script-src 'unsafe-inline' que
		// vivia no vercel.json e anulava a proteção anti-XSS. Os scripts do
		// app.html levam nonce="%sveltekit.nonce%". style-src segue com
		// unsafe-inline: Svelte usa style attrs/transições inline à exaustão.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': [
					'self',
					'https://plausible.io',
					'https://*.sentry.io',
					'https://*.ingest.sentry.io',
					'https://va.vercel-scripts.com'
				],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://*.supabase.co',
					'wss://*.supabase.co',
					'https://plausible.io',
					'https://*.sentry.io',
					'https://*.ingest.sentry.io',
					'https://va.vercel-scripts.com',
					'https://vitals.vercel-insights.com'
				],
				'media-src': ['self', 'blob:'],
				'frame-ancestors': ['self'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none']
			}
		}
	},
	compilerOptions: {
		runes: true
	}
};

export default config;
