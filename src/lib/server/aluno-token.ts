/**
 * Magic-link tokens pro app do aluno.
 *
 * Geração: HMAC-SHA256(payload, secret) truncado pra 24 hex chars, onde
 * payload = studentId (versão 1, compatível com links já distribuídos) ou
 * `${studentId}.v${version}` (versões seguintes). A versão vive em
 * students.link_token_version: incrementar revoga SÓ o link daquele aluno,
 * sem trocar o secret global (que invalidaria os links de todos).
 *
 * Determinístico — mesma URL serve sempre, mas não dá pra adivinhar
 * sem o secret server-side.
 *
 * Secret = ALUNO_LINK_SECRET (dedicado, `openssl rand -hex 32`). Fallback:
 * SHA-256 da SUPABASE_SERVICE_ROLE_KEY completa — nunca um slice, pois o
 * prefixo de todo JWT do Supabase é um header público constante.
 */
import { createHmac, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

function getSecret(): string {
	const dedicated = env.ALUNO_LINK_SECRET ?? process.env.ALUNO_LINK_SECRET ?? '';
	if (dedicated) return dedicated;
	const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
	if (!key)
		throw new Error(
			'ALUNO_LINK_SECRET/SUPABASE_SERVICE_ROLE_KEY ausentes — sem secret pro magic-link'
		);
	return createHash('sha256').update(key).digest('hex');
}

export function signStudentToken(studentId: string, version = 1): string {
	const secret = getSecret();
	const payload = version <= 1 ? studentId : `${studentId}.v${version}`;
	return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24);
}

export function verifyStudentToken(
	studentId: string,
	token: string | null | undefined,
	version = 1
): boolean {
	if (!token) return false;
	const expected = signStudentToken(studentId, version);
	// Constant-time comparison
	if (expected.length !== token.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Verificação completa usada pelas rotas /a/[id]/*: busca a versão vigente
 * do link no banco e valida o token contra ela. Aluno inexistente (ou id
 * malformado) → false, sem vazar o motivo.
 */
export async function verifyStudentAccess(
	studentId: string,
	token: string | null | undefined
): Promise<boolean> {
	if (!token) return false;
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId))
		return false;
	// Import dinâmico evita ciclo db → schema → (nada) e mantém o módulo
	// importável em testes sem DATABASE_URL.
	const { db } = await import('./db');
	const { students } = await import('./db/schema');
	const rows = await db
		.select({ version: students.linkTokenVersion })
		.from(students)
		.where(eq(students.id, studentId))
		.limit(1);
	const version = rows[0]?.version;
	if (version == null) return false;
	return verifyStudentToken(studentId, token, version);
}

/**
 * Bypass de token pra desenvolvimento local. Exige DUAS condições: build de
 * dev E opt-in explícito via ALUNO_LINK_DEV_BYPASS=1 — assim um build de
 * produção acidentalmente marcado como dev não abre as rotas de dados de
 * saúde sozinho.
 */
export function alunoDevBypass(): boolean {
	return dev && (env.ALUNO_LINK_DEV_BYPASS ?? process.env.ALUNO_LINK_DEV_BYPASS) === '1';
}

export function buildAlunoUrl(origin: string, studentId: string, version = 1): string {
	const token = signStudentToken(studentId, version);
	return `${origin}/a/${studentId}?t=${token}`;
}
