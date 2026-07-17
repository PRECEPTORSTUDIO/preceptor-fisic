/**
 * Derivação de tags de condição canônicas a partir de labels de diagnóstico.
 *
 * Fonte ÚNICA dos regexes de derivação — consumida pelo generator
 * (deriveConditionTags), pela revalidação em planos/[id]/+page.server.ts, pelo
 * motor de risco CV e pelo cálculo ao vivo no cadastro de aluno. Função PURA e
 * client-safe (sem imports de $lib/server) — por isso vive em $lib/clinical.
 * CONTRATO estável: deriveTagsFromDiagnosisLabels(labels: string[]): string[].
 * Retorna SÓ as tags derivadas (pode ser vazio) — default populacao_geral é
 * responsabilidade do chamador.
 *
 * Word boundaries importantes: \bhas\b (senão "Hashimoto" vira hipertensão)
 * e \blca\b (senão "calcaneo" digitado sem acento vira LCA pós-cirúrgico).
 */
export function deriveTagsFromDiagnosisLabels(labels: string[]): string[] {
	const tags = new Set<string>();
	for (const raw of labels) {
		const label = (raw ?? '').toLowerCase();
		if (!label) continue;
		if (/hipertens|press[aã]o alta|\bhas\b/.test(label)) {
			// Severidade pode vir embutida no label (o generator anexa "(grave)").
			// Estágio 2 = "estágio 2/II" OU "grau 2/II" (fraseado comum no Brasil).
			tags.add(
				/\bgrave\b|est[aá]gio\s*(2|ii)\b|grau\s*(2|ii)\b/.test(label)
					? 'hipertensao_estagio_2'
					: 'hipertensao_estagio_1'
			);
		}
		// Um label genérico "diabetes" casava nas DUAS regras → marcava o aluno
		// como tipo 1 E tipo 2 ao mesmo tempo (contraindicações conflitantes).
		// Tipo só quando explícito; diabetes genérico → tipo 2 (~90% dos casos).
		if (/diabetes|diabet|\bdm\b|dm[12]|dm [12]/.test(label)) {
			const isDm1 = /dm1|dm 1|tipo 1|tipo i\b/.test(label);
			const isDm2 = /dm2|dm 2|tipo 2|tipo ii\b/.test(label);
			if (isDm1) tags.add('diabetes_tipo_1');
			if (isDm2 || !isDm1) tags.add('diabetes_tipo_2');
		}
		if (/cardiopat|coronar|iam|infarto|dac/.test(label)) tags.add('cardiopatia_isquemica');
		if (/insufici[eê]ncia card|icc/.test(label)) tags.add('ic_compensada');
		if (/dpoc|enfisema|bronquite|pulmona/.test(label)) tags.add('dpoc_moderada');
		if (/avc|acidente vascular/.test(label)) tags.add('pos_avc');
		if (/parkinson/.test(label)) tags.add('parkinson_leve');
		if (/esclerose m/.test(label)) tags.add('esclerose_multipla');
		if (/gestante|gravida|gr[aá]vida/.test(label)) tags.add('gestante_segundo_trimestre');
		if (/idoso|fr[aá]gil|sarcopen/.test(label)) tags.add('idoso_fragil');
		if (/\blca\b|cruzado/.test(label)) tags.add('lca_pos_cirurgico');
		if (/osteoartr|artrose joelho/.test(label)) tags.add('osteoartrite_joelho');
		if (/osteoartr.*quadril|artrose quadril/.test(label)) tags.add('osteoartrite_quadril');
		if (/dor lombar|lombalgia/.test(label)) tags.add('dor_lombar_cronica');
		if (/obesidade.*iii|grau 3|m[oó]rbida/.test(label)) tags.add('obesidade_grau_3');
		if (/obesidade/.test(label)) tags.add('obesidade_grau_1');
		if (/c[aâ]ncer|oncolog/.test(label)) tags.add('cancer_em_tratamento');
		if (/dislipid|colesterol/.test(label)) tags.add('dislipidemia');
		if (/dhgna|hep[aá]ti/.test(label)) tags.add('doenca_hepatica_compensada');
	}
	return Array.from(tags);
}
