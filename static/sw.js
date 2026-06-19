// KILL SWITCH — o service worker de cache anterior quebrava as navegações:
// ele fazia fetch de páginas que respondem com redirect (auth: / → /dashboard
// → /login) e devolvia uma resposta redirecionada, o que o navegador proíbe
// num SW ("Response served by service worker has redirections" → ERR_FAILED).
// Isso derrubava cadastro/login/navegação.
//
// Este SW NÃO intercepta nada (sem fetch handler), limpa todos os caches,
// se desregistra e recarrega as abas abertas. Assim os usuários que ainda
// têm o SW velho são recuperados automaticamente no próximo acesso.

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			} catch {
				/* ignore */
			}
			try {
				await self.registration.unregister();
			} catch {
				/* ignore */
			}
			// Recarrega as abas controladas pra saírem do estado quebrado.
			try {
				const clients = await self.clients.matchAll({ type: 'window' });
				for (const client of clients) {
					client.navigate(client.url);
				}
			} catch {
				/* ignore */
			}
		})()
	);
});

// Sem 'fetch' handler de propósito — o SW não intercepta nenhuma requisição.
