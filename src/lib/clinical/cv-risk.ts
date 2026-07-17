/**
 * Motor de estratificação de risco cardiovascular — função pura, sem DB.
 *
 * Modelo: ACSM adaptado (contagem de fatores de risco + doença conhecida +
 * sinais/sintomas), mapeado para as 4 faixas do app (baixo · moderado · alto ·
 * muito_alto). Espelha o estilo de `attention.ts`: entra sinal já computado por
 * aluno, sai UMA classificação com a JUSTIFICATIVA (quais fatores pesaram).
 *
 * IMPORTANTE — isto é uma SUGESTÃO, não um diagnóstico. A decisão final é do
 * profissional (fluxo sugerir+confirmar). Os limiares abaixo são constantes
 * revisáveis: se o Matheus quiser calibrar, muda aqui num lugar só.
 *
 * Limitações conhecidas (viram `dataGaps` na saída, reduzindo a confiança):
 * o banco hoje não tem colesterol/glicemia de lab, histórico familiar, nem
 * nível de atividade atual — então alguns fatores ACSM clássicos não entram na
 * contagem automática. Ver [[projeto-preceptor-fisic]].
 */

export type CvRiskLevel = 'baixo' | 'moderado' | 'alto' | 'muito_alto';
export type Sex = 'feminino' | 'masculino' | 'outro' | 'nao_informado';

export type CvRiskFactor = {
	/** Código estável do fator (idade, hipertensao, obesidade…). */
	code: string;
	/** Rótulo humano em PT-BR. */
	label: string;
	/** Detalhe do dado que disparou o fator ("PA 148/94 mmHg"). */
	detail?: string;
};

export type CvRiskInput = {
	sex: Sex;
	ageYears: number | null;
	/** IMC — da avaliação física mais recente OU calculado de peso/altura. */
	bmi: number | null;
	systolicBp: number | null;
	diastolicBp: number | null;
	restingHr: number | null;
	/** Circunferência abdominal (cm). Obesidade central é fator de risco ACSM
	 *  independente do IMC (>102 ♂ / >88 ♀). null = não medida. */
	waistCm: number | null;
	/** Tags canônicas derivadas dos diagnósticos (deriveTagsFromDiagnosisLabels). */
	conditionTags: string[];
	diagnoses: Array<{ label: string; severity?: 'leve' | 'moderada' | 'grave' }>;
	medications: Array<{ name: string }>;
	/** Qualquer resposta "sim" no PAR-Q ⇒ true. null = PAR-Q não preenchido. */
	parqPositive: boolean | null;
};

export type CvRiskAssessment = {
	level: CvRiskLevel;
	/** Fatores de risco ACSM contados (positivos). */
	factors: CvRiskFactor[];
	riskFactorCount: number;
	/** Doenças cardiovasculares/metabólicas conhecidas detectadas (rótulos). */
	knownDisease: string[];
	/** PAR-Q positivo = presença de sinais/sintomas ⇒ liberação médica. */
	symptomatic: boolean;
	/** Frases curtas explicando por que caiu nesta faixa. */
	reasons: string[];
	/** Dados ausentes que limitam a confiança da sugestão. */
	dataGaps: string[];
	confidence: 'alta' | 'media' | 'baixa';
};

// ── Limiares (ACSM-adaptado) — AJUSTÁVEIS num lugar só ────────────────────────
const AGE_MALE = 45; // homem ≥45 anos = fator de risco
const AGE_FEMALE = 55; // mulher ≥55 anos = fator de risco
const OBESITY_BMI = 30; // IMC ≥30 = obesidade (fator)
const WAIST_MALE = 102; // cintura ♂ >102 cm = obesidade central (fator)
const WAIST_FEMALE = 88; // cintura ♀ >88 cm = obesidade central (fator)
const HTN_SYS = 130; // PA sistólica ≥130 (fator hipertensão) — corte AHA/ACC
const HTN_DIA = 80; // PA diastólica ≥80 (fator hipertensão)
const CRISIS_SYS = 180; // PA ≥180/110 = faixa de crise ⇒ empurra p/ muito_alto
const CRISIS_DIA = 110;

/** Tags que representam doença CV/metabólica CONHECIDA (→ pelo menos "alto"). */
const KNOWN_DISEASE_TAGS: Record<string, string> = {
	cardiopatia_isquemica: 'Cardiopatia isquêmica',
	ic_compensada: 'Insuficiência cardíaca',
	pos_avc: 'Pós-AVC',
	diabetes_tipo_1: 'Diabetes tipo 1',
	diabetes_tipo_2: 'Diabetes tipo 2'
};

// Best-effort: sem campo dedicado de tabagismo/anti-hipertensivo, casamos por
// texto de medicamentos/diagnósticos. Falsos negativos são aceitáveis (a
// sugestão é confirmada por humano); por isso listamos os gaps na saída.
const ANTIHYPERTENSIVE_RE =
	/losartan|valsartan|candesartan|enalapril|captopril|ramipril|lisinopril|anlodipin|amlodipin|nifedipin|hidroclorotiazid|clortalidon|furosemid|atenolol|metoprolol|propranolol|carvedilol|bisoprolol|espironolacton/i;
const STATIN_RE =
	/sinvastatin|atorvastatin|rosuvastatin|pravastatin|ezetimib|fenofibrat|genfibrozil/i;
const SMOKING_RE = /tabag|fumant|\bfuma\b|nicotin|cigarr/i;

function hasAny(re: RegExp, items: Array<{ name?: string; label?: string }>): boolean {
	return items.some((i) => re.test(i.name ?? i.label ?? ''));
}

/**
 * Estratifica o risco CV de um aluno. Determinístico e puro.
 */
export function stratifyCardiovascularRisk(input: CvRiskInput): CvRiskAssessment {
	const factors: CvRiskFactor[] = [];
	const reasons: string[] = [];
	const dataGaps: string[] = [];

	const meds = input.medications ?? [];
	const diags = input.diagnoses ?? [];
	const tags = input.conditionTags ?? [];

	// ── Fatores de risco ACSM (contagem) ────────────────────────────────────
	// 1. Idade
	if (input.ageYears !== null) {
		const threshold =
			input.sex === 'masculino' ? AGE_MALE : input.sex === 'feminino' ? AGE_FEMALE : null;
		if (threshold !== null && input.ageYears >= threshold) {
			factors.push({ code: 'idade', label: 'Idade', detail: `${input.ageYears} anos` });
		}
	} else {
		dataGaps.push('Idade não informada (data de nascimento ausente)');
	}

	// 2. Hipertensão — por PA medida, medicamento ou tag de diagnóstico
	const bpKnown = input.systolicBp !== null && input.diastolicBp !== null;
	const htnByBp =
		(input.systolicBp !== null && input.systolicBp >= HTN_SYS) ||
		(input.diastolicBp !== null && input.diastolicBp >= HTN_DIA);
	const htnByTag = tags.some((t) => t.startsWith('hipertensao'));
	const htnByMed = hasAny(ANTIHYPERTENSIVE_RE, meds);
	if (htnByBp || htnByTag || htnByMed) {
		const detail = bpKnown
			? `PA ${input.systolicBp}/${input.diastolicBp} mmHg`
			: htnByMed
				? 'em uso de anti-hipertensivo'
				: 'diagnóstico de hipertensão';
		factors.push({ code: 'hipertensao', label: 'Hipertensão arterial', detail });
	}
	if (!bpKnown) dataGaps.push('Pressão arterial não medida na avaliação física');

	// 3. Obesidade — por IMC (≥30) OU obesidade central (cintura por sexo).
	const obeseByBmi = input.bmi !== null && input.bmi >= OBESITY_BMI;
	const waistThreshold =
		input.sex === 'masculino' ? WAIST_MALE : input.sex === 'feminino' ? WAIST_FEMALE : null;
	const centralObesity =
		input.waistCm !== null && waistThreshold !== null && input.waistCm >= waistThreshold;
	if (obeseByBmi || centralObesity) {
		factors.push({
			code: 'obesidade',
			label: obeseByBmi ? 'Obesidade' : 'Obesidade central',
			detail: obeseByBmi ? `IMC ${input.bmi}` : `cintura ${input.waistCm} cm`
		});
	}
	if (input.bmi === null) dataGaps.push('IMC indisponível (peso/altura ausentes)');
	if (input.waistCm === null && waistThreshold !== null)
		dataGaps.push('Circunferência abdominal não medida');

	// 4. Dislipidemia — por tag ou uso de hipolipemiante
	if (tags.includes('dislipidemia') || hasAny(STATIN_RE, meds)) {
		factors.push({
			code: 'dislipidemia',
			label: 'Dislipidemia',
			detail: hasAny(STATIN_RE, meds) ? 'em uso de hipolipemiante' : 'diagnóstico registrado'
		});
	}

	// 5. Tabagismo — best-effort por texto (sem campo dedicado)
	if (hasAny(SMOKING_RE, meds) || hasAny(SMOKING_RE, diags)) {
		factors.push({ code: 'tabagismo', label: 'Tabagismo' });
	} else {
		dataGaps.push('Tabagismo não coletado (sem campo dedicado)');
	}

	// Fatores ACSM que o modelo de dados atual não cobre — sinalizar.
	dataGaps.push('Histórico familiar de doença coronariana não coletado');
	dataGaps.push('Nível de atividade física atual não quantificado');

	// ── Doença conhecida (CV / metabólica) ──────────────────────────────────
	const knownDisease: string[] = [];
	for (const tag of tags) {
		if (KNOWN_DISEASE_TAGS[tag]) knownDisease.push(KNOWN_DISEASE_TAGS[tag]);
	}

	// ── Sinais/sintomas (PAR-Q) e severidade grave ──────────────────────────
	const symptomatic = input.parqPositive === true;
	if (input.parqPositive === null) dataGaps.push('PAR-Q não preenchido');
	const graveCardioMetabolic = diags.some(
		(d) =>
			d.severity === 'grave' &&
			/cardio|coron|infarto|diabet|press|hipertens|avc|isqu/i.test(d.label)
	);

	// PA em faixa de crise (≥180/110) — pesa forte para muito_alto.
	const crisisBp =
		(input.systolicBp !== null && input.systolicBp >= CRISIS_SYS) ||
		(input.diastolicBp !== null && input.diastolicBp >= CRISIS_DIA);

	// ── Mapa para as 4 faixas ────────────────────────────────────────────────
	const riskFactorCount = factors.length;
	let level: CvRiskLevel;

	if ((knownDisease.length > 0 && symptomatic) || crisisBp || graveCardioMetabolic) {
		level = 'muito_alto';
		if (crisisBp) reasons.push('Pressão arterial em faixa de crise (≥180/110 mmHg)');
		if (knownDisease.length > 0 && symptomatic)
			reasons.push(`Doença conhecida (${knownDisease.join(', ')}) com sinais/sintomas no PAR-Q`);
		if (graveCardioMetabolic) reasons.push('Diagnóstico cardiometabólico classificado como grave');
	} else if (knownDisease.length > 0 || symptomatic) {
		level = 'alto';
		if (knownDisease.length > 0)
			reasons.push(`Doença cardiometabólica conhecida: ${knownDisease.join(', ')}`);
		if (symptomatic) reasons.push('PAR-Q com resposta positiva (possíveis sinais/sintomas)');
	} else if (riskFactorCount >= 2) {
		level = 'moderado';
		reasons.push(`${riskFactorCount} fatores de risco cardiovascular presentes`);
	} else {
		level = 'baixo';
		reasons.push(
			riskFactorCount === 1
				? '1 fator de risco, sem doença conhecida nem sintomas'
				: 'Nenhum fator de risco relevante identificado'
		);
	}

	// ── Confiança conforme completude dos dados-chave ────────────────────────
	// Se já há doença conhecida ou crise, a faixa é robusta mesmo com gaps.
	let confidence: CvRiskAssessment['confidence'];
	if (knownDisease.length > 0 || crisisBp) {
		confidence = 'alta';
	} else {
		const missingKey = (input.parqPositive === null ? 1 : 0) + (!bpKnown ? 1 : 0);
		confidence = missingKey >= 2 ? 'baixa' : missingKey === 1 ? 'media' : 'alta';
	}

	return {
		level,
		factors,
		riskFactorCount,
		knownDisease,
		symptomatic,
		reasons,
		dataGaps,
		confidence
	};
}

const LEVEL_LABEL: Record<CvRiskLevel, string> = {
	baixo: 'Baixo',
	moderado: 'Moderado',
	alto: 'Alto',
	muito_alto: 'Muito alto'
};

export function cvRiskLabel(level: CvRiskLevel): string {
	return LEVEL_LABEL[level];
}

const RISK_ORDER: Record<CvRiskLevel, number> = {
	baixo: 0,
	moderado: 1,
	alto: 2,
	muito_alto: 3
};

/**
 * Risco EFETIVO = o mais grave entre o calculado e um override manual do
 * profissional. Assim um override só pode subir a classificação (mais
 * conservador) — nunca mascarar um risco alto que o motor detectou.
 */
export function maxCvRisk(a: CvRiskLevel, b: CvRiskLevel): CvRiskLevel {
	return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Extrai circunferência abdominal (cm) de textos livres (diagnósticos/notas).
 * Best-effort — casa "circunferência abdominal de 100 cm", "cintura 95cm",
 * "CA 102 cm". Retorna o primeiro valor plausível (40–200 cm) ou null. Sem
 * campo estruturado no schema hoje; parsear aqui é o ganho imediato possível.
 */
export function extractWaistCm(texts: string[]): number | null {
	const re = /(?:circunfer[êe]ncia\s+abdominal|cintura|abdominal|\bca\b)[^\d]{0,12}(\d{2,3})\s*cm/i;
	for (const raw of texts) {
		const m = (raw ?? '').match(re);
		if (m) {
			const n = Number(m[1]);
			if (n >= 40 && n <= 200) return n;
		}
	}
	return null;
}
