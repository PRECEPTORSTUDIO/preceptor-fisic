/**
 * Tema claro/escuro (Svelte 5 rune store).
 *
 * O usuário escolhe uma PREFERÊNCIA — 'light', 'dark' ou 'system'. O tema
 * efetivamente aplicado (`resolved`) só difere quando a preferência é
 * 'system', caso em que seguimos o prefers-color-scheme do SO e reagimos a
 * mudanças em tempo real (o usuário muda o tema do Windows/macOS e o app
 * acompanha sem reload).
 *
 * Persistência é por COOKIE, não localStorage: o app é SSR, e o cookie deixa
 * o servidor já renderizar o <html data-theme> certo. Com localStorage a
 * página chegaria escura e piscaria pro claro.
 *
 * O estado inicial é lido do DOM (data-theme-pref), que o hooks.server.ts
 * preencheu — assim cliente e servidor começam sincronizados.
 */

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const COOKIE = 'theme';
const ONE_YEAR = 60 * 60 * 24 * 365;

function systemTheme(): Theme {
	if (typeof window === 'undefined') return 'dark';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPrefFromDom(): ThemePref {
	if (typeof document === 'undefined') return 'system';
	const p = document.documentElement.dataset.themePref;
	return p === 'light' || p === 'dark' ? p : 'system';
}

class ThemeStore {
	pref = $state<ThemePref>(readPrefFromDom());
	resolved = $state<Theme>('dark');

	constructor() {
		if (typeof window === 'undefined') return;

		const el = document.documentElement;
		this.resolved = el.dataset.theme === 'light' ? 'light' : 'dark';

		// Preferência 'system': acompanha o SO em tempo real.
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', () => {
			if (this.pref === 'system') this.apply(systemTheme());
		});
	}

	/** Grava no DOM + meta theme-color. Não mexe no cookie. */
	private apply(theme: Theme) {
		this.resolved = theme;
		const el = document.documentElement;
		el.dataset.theme = theme;
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#050505');
	}

	set(pref: ThemePref) {
		this.pref = pref;
		document.documentElement.dataset.themePref = pref;
		document.cookie = `${COOKIE}=${pref};path=/;max-age=${ONE_YEAR};samesite=lax`;
		this.apply(pref === 'system' ? systemTheme() : pref);
	}

	/** Alterna entre claro e escuro a partir do que está valendo agora. */
	toggle() {
		this.set(this.resolved === 'dark' ? 'light' : 'dark');
	}
}

export const theme = new ThemeStore();
