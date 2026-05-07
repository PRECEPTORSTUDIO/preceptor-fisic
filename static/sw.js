// Preceptor Fisic — service worker.
// Estratégias:
//  - /_app/immutable/* (hash no nome) → cache-first, ETERNO
//  - HTML (navigations) → stale-while-revalidate (mostra cache na hora, atualiza em bg)
//  - resto same-origin → network-first com fallback de cache
//  - cross-origin / non-GET / form actions → bypass

const VERSION = 'v3';
const CACHE_IMMUT = `pf-immut-${VERSION}`;
const CACHE_PAGES = `pf-pages-${VERSION}`;
const PRECACHE_PAGES = ['/', '/dashboard', '/manifest.webmanifest', '/favicon.svg', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_PAGES);
			await cache.addAll(PRECACHE_PAGES).catch(() => {});
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.filter((k) => k !== CACHE_IMMUT && k !== CACHE_PAGES).map((k) => caches.delete(k))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;

	// Bypass non-GET, cross-origin, e form actions/api
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.search.includes('?/')) return;

	// 1) Assets imutáveis (hash no path) → cache-first eterno
	//    SvelteKit mete tudo em /_app/immutable/* com hash no nome
	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(req, CACHE_IMMUT));
		return;
	}

	// 2) Static assets (icons, manifest, sw.js) → cache-first com revalidação
	if (
		url.pathname.startsWith('/icon-') ||
		url.pathname === '/favicon.svg' ||
		url.pathname === '/manifest.webmanifest'
	) {
		event.respondWith(staleWhileRevalidate(req, CACHE_IMMUT));
		return;
	}

	// 3) HTML/navigations → stale-while-revalidate
	//    Mostra cache instantâneo, atualiza em background pra próximo load.
	const accept = req.headers.get('accept') ?? '';
	if (req.mode === 'navigate' || accept.includes('text/html')) {
		event.respondWith(staleWhileRevalidate(req, CACHE_PAGES));
		return;
	}

	// 4) Resto same-origin → network-first
	event.respondWith(networkFirst(req, CACHE_PAGES));
});

async function cacheFirst(req, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(req);
	if (cached) return cached;
	try {
		const fresh = await fetch(req);
		if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
		return fresh;
	} catch {
		return new Response('Offline', { status: 503 });
	}
}

async function staleWhileRevalidate(req, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(req);
	const fetchPromise = fetch(req)
		.then((fresh) => {
			if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
			return fresh;
		})
		.catch(() => null);

	return (
		cached ??
		(await fetchPromise) ??
		new Response('Offline · sem conexão.', {
			status: 503,
			headers: { 'Content-Type': 'text/plain;charset=utf-8' }
		})
	);
}

async function networkFirst(req, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const fresh = await fetch(req);
		if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
		return fresh;
	} catch {
		const cached = await cache.match(req);
		return cached ?? new Response('Offline', { status: 503 });
	}
}
