import { createServerClient } from '@supabase/ssr';
import { type Handle, type HandleServerError, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/public';
import { env as privEnv } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { logger } from '$lib/server/logger';

const SUPABASE_CONFIGURED = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);

// Sentry: só inicializa se DSN setada. Sem isso, é no-op (não quebra dev).
const SENTRY_DSN = privEnv.SENTRY_DSN ?? env.PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
	Sentry.init({
		dsn: SENTRY_DSN,
		tracesSampleRate: privEnv.NODE_ENV === 'production' ? 0.1 : 1.0,
		environment: privEnv.NODE_ENV ?? 'development',
		// PII redaction — não enviar dados clínicos por engano
		sendDefaultPii: false,
		beforeSend(event) {
			// Drop bodies pra evitar vazamento de dados sensíveis
			if (event.request) {
				delete event.request.data;
				delete event.request.cookies;
			}
			return event;
		}
	});
}

const supabase: Handle = async ({ event, resolve }) => {
	if (!SUPABASE_CONFIGURED) {
		// Modo design — sem auth ainda. Mock locals pra não quebrar tipos.
		event.locals.session = null;
		event.locals.user = null;
		// @ts-expect-error — placeholder até configurar Supabase BR
		event.locals.supabase = null;
		event.locals.safeGetSession = async () => ({ session: null, user: null });
		return resolve(event);
	}

	event.locals.supabase = createServerClient(
		env.PUBLIC_SUPABASE_URL!,
		env.PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	event.locals.safeGetSession = async () => {
		// getSession/getUser fazem rede até o Supabase Auth. Um blip de rede
		// lança aqui e, como esse handler roda em TODA request, derrubaria o
		// site inteiro com 500. Tratamos como "não autenticado" — o authGuard
		// então manda pro /login, que é o comportamento seguro/esperado.
		try {
			const {
				data: { session }
			} = await event.locals.supabase.auth.getSession();
			if (!session) {
				return { session: null, user: null };
			}
			const {
				data: { user },
				error
			} = await event.locals.supabase.auth.getUser();
			if (error) {
				return { session: null, user: null };
			}
			return { session, user };
		} catch (err) {
			logger.warn({ err: String(err).slice(0, 200) }, 'auth.safeGetSession.failed');
			return { session: null, user: null };
		}
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	if (!SUPABASE_CONFIGURED) {
		// Sem Supabase: bypass guard. /+page.server.ts já redireciona / → /dashboard.
		return resolve(event);
	}

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const isPublic =
		event.url.pathname.startsWith('/login') ||
		event.url.pathname.startsWith('/a/') ||
		event.url.pathname.startsWith('/onboarding') ||
		event.url.pathname.startsWith('/recuperar') ||
		event.url.pathname.startsWith('/legal') ||
		event.url.pathname === '/sitemap.xml' ||
		event.url.pathname === '/robots.txt' ||
		event.url.pathname === '/';
	if (!session && !isPublic) {
		// Preserva o deep link: após login, a action lê ?next= e volta pro destino.
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}
	if (session && event.url.pathname === '/login') {
		redirect(303, '/dashboard');
	}
	return resolve(event);
};

/** Tema claro/escuro.
 *
 * O cookie guarda a PREFERÊNCIA ('light' | 'dark' | 'system'), não o tema
 * final. 'system' só o cliente resolve — o servidor não enxerga
 * prefers-color-scheme —, então mandamos data-theme vazio e o script inline
 * do app.html preenche antes do primeiro paint (sem flash).
 *
 * A landing (/) fica sempre escura: o dark faz parte da identidade da marca,
 * e a decisão foi restringir o tema claro ao app do profissional e do aluno.
 */
const THEME_PREFS = new Set(['light', 'dark', 'system']);

const theme: Handle = async ({ event, resolve }) => {
	const cookie = event.cookies.get('theme');
	let pref = cookie && THEME_PREFS.has(cookie) ? cookie : 'system';
	let resolved = pref === 'system' ? '' : pref;

	if (event.url.pathname === '/') {
		pref = 'dark';
		resolved = 'dark';
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme%', resolved).replace('%themePref%', pref)
	});
};

export const handle: Handle = SENTRY_DSN
	? sequence(Sentry.sentryHandle(), theme, supabase, authGuard)
	: sequence(theme, supabase, authGuard);

export const handleError: HandleServerError = ({ error, event, status }) => {
	// 4xx não vai pro Sentry (são erros esperados — auth, validation, etc)
	if (status < 500) {
		logger.warn(
			{ status, path: event.url.pathname, err: String(error).slice(0, 200) },
			'request.error.4xx'
		);
		return {
			message:
				typeof error === 'object' && error && 'message' in error
					? String((error as { message: unknown }).message)
					: 'Erro'
		};
	}
	// 5xx → Sentry + log
	if (SENTRY_DSN) {
		Sentry.captureException(error, { extra: { path: event.url.pathname } });
	}
	// Loga também a causa raiz: erros do driver (drizzle "Failed query")
	// escondem o motivo real (ex: "password authentication failed") em .cause.
	const cause = (error as { cause?: unknown })?.cause;
	logger.error(
		{
			status,
			path: event.url.pathname,
			err: String(error).slice(0, 300),
			cause: cause != null ? String(cause).slice(0, 300) : undefined
		},
		'request.error.5xx'
	);
	return { message: 'Erro interno. Tente de novo em alguns segundos.' };
};
