import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// maxDuration: 60 é o teto da função na Vercel. Sem isso o default
		// é 10s no Hobby — a geração de plano (~45s com Flash) morre antes
		// de terminar. O `export const config = { maxDuration: 60 }` por
		// rota só vale com adapter split; aqui o adapter empacota tudo
		// numa função só, então setamos global.
		adapter: adapter({ regions: ['gru1'], runtime: 'nodejs22.x', maxDuration: 60 }),
		alias: {
			$lib: './src/lib'
		}
	},
	compilerOptions: {
		runes: true
	}
};

export default config;
