import { describe, it, expect } from 'vitest';
import { deriveTagsFromDiagnosisLabels } from './condition-tags';

describe('deriveTagsFromDiagnosisLabels — estadiação da hipertensão', () => {
	it('"hipertensão grau II" → estágio 2', () => {
		expect(deriveTagsFromDiagnosisLabels(['hipertensão grau II'])).toContain(
			'hipertensao_estagio_2'
		);
	});
	it('"HAS grau 2" → estágio 2', () => {
		expect(deriveTagsFromDiagnosisLabels(['HAS grau 2'])).toContain('hipertensao_estagio_2');
	});
	it('"hipertensão estágio 2" → estágio 2', () => {
		expect(deriveTagsFromDiagnosisLabels(['hipertensão estágio 2'])).toContain(
			'hipertensao_estagio_2'
		);
	});
	it('"hipertensão grau I" → estágio 1', () => {
		const tags = deriveTagsFromDiagnosisLabels(['hipertensão grau I']);
		expect(tags).toContain('hipertensao_estagio_1');
		expect(tags).not.toContain('hipertensao_estagio_2');
	});
	it('"HAS" genérico → estágio 1', () => {
		expect(deriveTagsFromDiagnosisLabels(['HAS'])).toContain('hipertensao_estagio_1');
	});
	it('não confunde "Hashimoto" com hipertensão', () => {
		expect(deriveTagsFromDiagnosisLabels(['tireoidite de Hashimoto'])).not.toContain(
			'hipertensao_estagio_1'
		);
	});
});
