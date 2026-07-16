import { describe, it, expect } from 'vitest';
import { stratifyCardiovascularRisk, cvRiskLabel, type CvRiskInput } from './cv-risk';

const base: CvRiskInput = {
	sex: 'masculino',
	ageYears: 30,
	bmi: 23,
	systolicBp: 118,
	diastolicBp: 76,
	restingHr: 64,
	conditionTags: [],
	diagnoses: [],
	medications: [],
	parqPositive: false
};

describe('stratifyCardiovascularRisk', () => {
	it('jovem saudável, PA normal, sem fatores → baixo', () => {
		const r = stratifyCardiovascularRisk(base);
		expect(r.level).toBe('baixo');
		expect(r.riskFactorCount).toBe(0);
		expect(r.confidence).toBe('alta');
	});

	it('1 fator isolado ainda é baixo', () => {
		const r = stratifyCardiovascularRisk({ ...base, bmi: 31 }); // só obesidade
		expect(r.level).toBe('baixo');
		expect(r.factors.map((f) => f.code)).toEqual(['obesidade']);
	});

	it('≥2 fatores sem doença/sintoma → moderado', () => {
		// idade (homem 50) + obesidade
		const r = stratifyCardiovascularRisk({ ...base, ageYears: 50, bmi: 32 });
		expect(r.level).toBe('moderado');
		expect(r.riskFactorCount).toBeGreaterThanOrEqual(2);
	});

	it('PA elevada conta como fator de hipertensão com detalhe', () => {
		const r = stratifyCardiovascularRisk({ ...base, systolicBp: 148, diastolicBp: 94 });
		const htn = r.factors.find((f) => f.code === 'hipertensao');
		expect(htn).toBeTruthy();
		expect(htn?.detail).toContain('148/94');
	});

	it('anti-hipertensivo em uso conta mesmo com PA controlada', () => {
		const r = stratifyCardiovascularRisk({
			...base,
			systolicBp: 120,
			diastolicBp: 78,
			medications: [{ name: 'Losartana 50mg' }]
		});
		expect(r.factors.some((f) => f.code === 'hipertensao')).toBe(true);
	});

	it('doença cardiometabólica conhecida (tag) → alto', () => {
		const r = stratifyCardiovascularRisk({ ...base, conditionTags: ['diabetes_tipo_2'] });
		expect(r.level).toBe('alto');
		expect(r.knownDisease).toContain('Diabetes tipo 2');
	});

	it('PAR-Q positivo sem doença → alto (sinais/sintomas)', () => {
		const r = stratifyCardiovascularRisk({ ...base, parqPositive: true });
		expect(r.level).toBe('alto');
		expect(r.symptomatic).toBe(true);
	});

	it('doença conhecida + PAR-Q positivo → muito_alto', () => {
		const r = stratifyCardiovascularRisk({
			...base,
			conditionTags: ['cardiopatia_isquemica'],
			parqPositive: true
		});
		expect(r.level).toBe('muito_alto');
	});

	it('PA em crise (≥180/110) → muito_alto com confiança alta', () => {
		const r = stratifyCardiovascularRisk({ ...base, systolicBp: 190, diastolicBp: 112 });
		expect(r.level).toBe('muito_alto');
		expect(r.confidence).toBe('alta');
		expect(r.reasons.some((x) => /crise/i.test(x))).toBe(true);
	});

	it('diagnóstico cardiometabólico grave → muito_alto', () => {
		const r = stratifyCardiovascularRisk({
			...base,
			diagnoses: [{ label: 'Cardiopatia isquêmica', severity: 'grave' }]
		});
		expect(r.level).toBe('muito_alto');
	});

	it('idade não conta fator para sexo não informado', () => {
		const r = stratifyCardiovascularRisk({ ...base, sex: 'nao_informado', ageYears: 70 });
		expect(r.factors.some((f) => f.code === 'idade')).toBe(false);
	});

	it('mulher <55 não dispara fator idade; ≥55 dispara', () => {
		expect(
			stratifyCardiovascularRisk({ ...base, sex: 'feminino', ageYears: 50 }).factors.some(
				(f) => f.code === 'idade'
			)
		).toBe(false);
		expect(
			stratifyCardiovascularRisk({ ...base, sex: 'feminino', ageYears: 58 }).factors.some(
				(f) => f.code === 'idade'
			)
		).toBe(true);
	});

	it('PA e PAR-Q ausentes reduzem a confiança para baixa', () => {
		const r = stratifyCardiovascularRisk({
			...base,
			systolicBp: null,
			diastolicBp: null,
			parqPositive: null
		});
		expect(r.confidence).toBe('baixa');
		expect(r.dataGaps.some((g) => /PAR-Q/.test(g))).toBe(true);
		expect(r.dataGaps.some((g) => /Press[aã]o/.test(g))).toBe(true);
	});

	it('cvRiskLabel traduz as faixas', () => {
		expect(cvRiskLabel('muito_alto')).toBe('Muito alto');
		expect(cvRiskLabel('baixo')).toBe('Baixo');
	});
});
