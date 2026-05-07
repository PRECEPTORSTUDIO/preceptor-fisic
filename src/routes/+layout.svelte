<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { ToastContainer } from '$lib/components/ui';
	import type { Snippet } from 'svelte';

	// Preload das duas fontes mais críticas (500 sans + 500 mono).
	// `?url` faz Vite resolver pra URL hasheada do build.
	import sansUrl from '@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url';
	import monoUrl from '@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2?url';

	let { children }: { children: Snippet } = $props();

	// View Transitions: cross-fade suave entre rotas. Só age no conteúdo
	// marcado com `view-transition-name: page-content` (sidebar fica estável).
	onNavigate((nav) => {
		// @ts-expect-error — startViewTransition é opt-in (Chrome/Edge/Safari recente)
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			// @ts-expect-error
			document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="preload" href={sansUrl} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={monoUrl} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

{@render children()}
<ToastContainer />
