/**
 * Sentry no client — só ativa se PUBLIC_SENTRY_DSN setada.
 * Sem isso é no-op, não impacta dev nem build.
 */
import { handleErrorWithSentry, replayIntegration } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

const DSN = env.PUBLIC_SENTRY_DSN;

if (DSN) {
	Sentry.init({
		dsn: DSN,
		tracesSampleRate: 0.1,
		environment: env.PUBLIC_VERCEL_ENV ?? 'development',
		// Replay: só sample em erros pra economizar (10% de erros)
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0.1,
		integrations: [
			replayIntegration({
				maskAllText: true, // mascarar texto — dados clínicos
				blockAllMedia: true
			})
		]
	});
}

export const handleError = handleErrorWithSentry();
