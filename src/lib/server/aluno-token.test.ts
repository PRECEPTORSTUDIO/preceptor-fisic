/**
 * Unit tests do magic-link signer.
 * Mocka $env/dynamic/private pra rodar offline.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock do $env antes de importar o módulo
vi.mock('$env/dynamic/private', () => ({
	env: { ALUNO_LINK_SECRET: 'f'.repeat(64) } // secret dedicado (openssl rand -hex 32)
}));

const { signStudentToken, verifyStudentToken } = await import('./aluno-token');

describe('signStudentToken', () => {
	it('produz token determinístico de 24 hex chars', () => {
		const t1 = signStudentToken('student-123');
		const t2 = signStudentToken('student-123');
		expect(t1).toBe(t2);
		expect(t1).toMatch(/^[a-f0-9]{24}$/);
	});

	it('produz tokens diferentes pra studentIds diferentes', () => {
		const a = signStudentToken('student-123');
		const b = signStudentToken('student-456');
		expect(a).not.toBe(b);
	});
});

describe('verifyStudentToken', () => {
	it('aceita token válido', () => {
		const id = 'abc-123';
		const token = signStudentToken(id);
		expect(verifyStudentToken(id, token)).toBe(true);
	});

	it('rejeita token vazio/null/undefined', () => {
		expect(verifyStudentToken('abc', null)).toBe(false);
		expect(verifyStudentToken('abc', undefined)).toBe(false);
		expect(verifyStudentToken('abc', '')).toBe(false);
	});

	it('rejeita token de outro studentId', () => {
		const tokenA = signStudentToken('student-A');
		expect(verifyStudentToken('student-B', tokenA)).toBe(false);
	});

	it('rejeita token de tamanho diferente', () => {
		const valid = signStudentToken('id');
		expect(verifyStudentToken('id', valid + 'x')).toBe(false);
		expect(verifyStudentToken('id', valid.slice(0, 10))).toBe(false);
	});

	it('é constant-time (sem early return)', () => {
		// Smoke test — apenas confirma que tokens com mesmo length retornam false
		// sem crashar (não testa timing real, mas garante o code path)
		const valid = signStudentToken('id');
		const same_length_wrong = '0'.repeat(24);
		expect(verifyStudentToken('id', same_length_wrong)).toBe(false);
	});
});

describe('token versionado (revogação por aluno)', () => {
	it('versão 1 mantém o formato legado (links já enviados seguem válidos)', () => {
		const legacy = signStudentToken('student-123');
		expect(signStudentToken('student-123', 1)).toBe(legacy);
	});

	it('incrementar a versão muda o token e invalida o anterior', () => {
		const v1 = signStudentToken('student-123', 1);
		const v2 = signStudentToken('student-123', 2);
		expect(v2).not.toBe(v1);
		expect(verifyStudentToken('student-123', v1, 2)).toBe(false);
		expect(verifyStudentToken('student-123', v2, 2)).toBe(true);
	});

	it('versões diferentes não colidem entre alunos', () => {
		expect(signStudentToken('student-A', 2)).not.toBe(signStudentToken('student-B', 2));
	});
});
