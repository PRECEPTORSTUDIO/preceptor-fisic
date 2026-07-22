/**
 * Providers de IA centralizados e lazy — instanciam a cada chamada lendo
 * apiKey do $env/dynamic/private. Sem cache estático, porque HMR pode
 * trocar valores sem re-importar o módulo.
 *
 * GERAÇÃO usa Anthropic (Claude). O Google fica SÓ pros embeddings do RAG:
 * a base (knowledge_chunks) foi embedada com gemini-embedding-001 e a
 * Anthropic não tem API de embeddings — trocar o modelo de embedding
 * exigiria re-embedar os 2.040 chunks.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '$env/dynamic/private';

type GoogleProvider = ReturnType<typeof createGoogleGenerativeAI>;
type AnthropicProvider = ReturnType<typeof createAnthropic>;

function instantiateAnthropic(): AnthropicProvider {
	const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado em .env.local');
	return createAnthropic({ apiKey });
}

const anthropicTarget = function placeholder() {} as unknown as AnthropicProvider;

export const anthropic: AnthropicProvider = new Proxy(anthropicTarget, {
	get(_t, prop, receiver) {
		const fresh = instantiateAnthropic();
		return Reflect.get(fresh, prop, receiver);
	},
	apply(_t, _thisArg, args) {
		const fresh = instantiateAnthropic();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (fresh as unknown as (...a: unknown[]) => unknown).apply(fresh, args as any);
	}
}) as AnthropicProvider;

function instantiate(): GoogleProvider {
	const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY não configurado em .env.local');
	return createGoogleGenerativeAI({ apiKey });
}

const target = function placeholder() {} as unknown as GoogleProvider;

export const google: GoogleProvider = new Proxy(target, {
	get(_t, prop, receiver) {
		const fresh = instantiate();
		return Reflect.get(fresh, prop, receiver);
	},
	apply(_t, _thisArg, args) {
		const fresh = instantiate();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (fresh as unknown as (...a: unknown[]) => unknown).apply(fresh, args as any);
	}
}) as GoogleProvider;
