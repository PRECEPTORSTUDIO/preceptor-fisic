import { error } from '@sveltejs/kit';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { RequestHandler } from './$types';

/**
 * Manifest PWA do ALUNO — dinâmico por aluno/token.
 *
 * O manifest global (static/manifest.webmanifest) tem start_url /dashboard
 * (área do profissional): aluno que instalasse por ele abriria o app no
 * /login sem credenciais. Aqui start_url/scope apontam pro link tokenizado,
 * então o ícone instalado abre direto no treino.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
		error(403, 'link inválido.');
	}

	const tq = token ? `?t=${token}` : '';
	const startUrl = `/a/${params.id}${tq}`;
	const manifest = {
		name: 'Meu treino',
		short_name: 'Meu treino',
		description: 'Seu treino prescrito no PreceptorFISIC.',
		id: startUrl,
		start_url: startUrl,
		scope: `/a/${params.id}`,
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#050505',
		theme_color: '#A78BFA',
		lang: 'pt-BR',
		dir: 'ltr',
		icons: [
			// PNG: iOS/instalação não rasterizam SVG de manifest com confiança.
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{ src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
		]
	};

	return new Response(JSON.stringify(manifest), {
		headers: {
			'content-type': 'application/manifest+json',
			// Token na URL → nunca cachear em proxy compartilhado
			'cache-control': 'private, max-age=3600'
		}
	});
};
