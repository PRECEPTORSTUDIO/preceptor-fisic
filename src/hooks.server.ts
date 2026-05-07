import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/public';

const SUPABASE_CONFIGURED = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);

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
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) return { session: null, user: null };
		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
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
		event.url.pathname === '/';
	if (!session && !isPublic) {
		redirect(303, '/login');
	}
	if (session && event.url.pathname === '/login') {
		redirect(303, '/dashboard');
	}
	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
