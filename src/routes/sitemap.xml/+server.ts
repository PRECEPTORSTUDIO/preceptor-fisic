/**
 * Sitemap XML — apenas rotas públicas indexáveis.
 * Crawlers veem isso em /sitemap.xml.
 */
import type { RequestHandler } from './$types';

const ROUTES = [
	{ path: '/', priority: 1.0, changefreq: 'weekly' },
	{ path: '/login', priority: 0.6, changefreq: 'monthly' },
	{ path: '/legal/termos', priority: 0.4, changefreq: 'yearly' },
	{ path: '/legal/privacidade', priority: 0.4, changefreq: 'yearly' }
];

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const today = new Date().toISOString().slice(0, 10);

	const urls = ROUTES.map(
		(r) => `	<url>
		<loc>${origin}${r.path}</loc>
		<lastmod>${today}</lastmod>
		<changefreq>${r.changefreq}</changefreq>
		<priority>${r.priority.toFixed(1)}</priority>
	</url>`
	).join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600, s-maxage=86400'
		}
	});
};
