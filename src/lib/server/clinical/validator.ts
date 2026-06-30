/**
 * Engine de validação clínica do Preceptor Fisic.
 *
 * Roda APÓS a IA gerar o plano. Passa cada exercício/sessão pela bateria de
 * regras em `clinical_rules` e produz uma lista de violations que viram
 * `restrictions` no plano (com source.type === 'rule', distinguindo das
 * restrições que a própria IA inferiu).
 *
 * Algoritmo:
 *   1. Filtra regras aplicáveis ao perfil do aluno (condition_tags, age, cv_risk)
 *   2. Pra cada regra:
 *      a) forbid.exercise_patterns → regex contra exercise.name + execution_notes
 *      b) forbid.intensity_above   → parse load_guidance, compara contra threshold
 *      c) forbid.volume_above      → count sessions / max minutes
 *      d) require.monitoring       → check se plan.monitoring_parameters cobre
 *      e) require.medical_clearance → flag (já bloqueia publicação se red)
 *   3. Cada violation vira uma Restriction com source.rule_code + source.type='rule'
 */
import { eq, and, sql as sqlOp } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { clinicalRules, type Restriction, type RuleDSL } from '$lib/server/db/schema';
import type { TrainingPlanOutput, Exercise } from '$lib/schemas/training-plan';
import type { HealthProfile } from '$lib/server/db/schema';
import { logger } from '$lib/server/logger';

const CV_RISK_ORDER = ['baixo', 'moderado', 'alto', 'muito_alto'] as const;
type CvRisk = (typeof CV_RISK_ORDER)[number];

type StudentCtx = {
	conditionTags: string[];
	age: number | null;
	cvRisk: CvRisk;
};

type ClinicalRuleRow = {
	code: string;
	title: string;
	description: string;
	severity: 'red' | 'yellow' | 'green';
	conditionTags: string[];
	ruleDsl: RuleDSL;
};

/* ────────── Filtro: regra aplicável a este aluno? ────────── */

function appliesTo(rule: ClinicalRuleRow, ctx: StudentCtx): boolean {
	const w = rule.ruleDsl.when ?? {};

	// As condition_tags da regra (coluna) definem A QUE condição ela se refere.
	// Isso escopa a regra SEMPRE — os filtros `when` (idade, risco CV) são
	// restrições ADICIONAIS, não substitutas. Antes, uma regra com tags +
	// um `when.age_gte` aplicava só pela idade, ignorando as tags → marcava
	// restrição de uma condição que o aluno nem tinha (falso positivo que
	// podia bloquear a publicação indevidamente).
	if (rule.conditionTags && rule.conditionTags.length > 0) {
		if (!rule.conditionTags.some((t) => ctx.conditionTags.includes(t))) return false;
	}

	// condition_tags_any → student tem AO MENOS uma
	if (w.condition_tags_any && w.condition_tags_any.length > 0) {
		if (!w.condition_tags_any.some((t) => ctx.conditionTags.includes(t))) return false;
	}

	// condition_tags_all → student tem TODAS
	if (w.condition_tags_all && w.condition_tags_all.length > 0) {
		if (!w.condition_tags_all.every((t) => ctx.conditionTags.includes(t))) return false;
	}

	// age range
	if (w.age_gte != null && (ctx.age == null || ctx.age < w.age_gte)) return false;
	if (w.age_lte != null && (ctx.age == null || ctx.age > w.age_lte)) return false;

	// cv_risk_min: student.cvRisk >= rule.cv_risk_min
	if (w.cv_risk_min) {
		const studentIdx = CV_RISK_ORDER.indexOf(ctx.cvRisk);
		const minIdx = CV_RISK_ORDER.indexOf(w.cv_risk_min);
		if (studentIdx < minIdx) return false;
	}

	return true;
}

/* ────────── Helpers de parsing de load_guidance ────────── */

function parseRpe(s: string | undefined): number | null {
	if (!s) return null;
	// "PSE 6-7" → 7 (max), "PSE 8" → 8. Aceita RPE também (planos legados antes
	// da troca de nomenclatura RPE→PSE e backfill).
	const m = s.match(/(?:RPE|PSE)\s*(\d+(?:[.,]\d+)?)\s*(?:[-–a]\s*(\d+(?:[.,]\d+)?))?/i);
	if (!m) return null;
	const high = m[2] ?? m[1];
	if (!high) return null;
	return Number(high.replace(',', '.'));
}

function parsePercent1RM(s: string | undefined): number | null {
	if (!s) return null;
	const m = s.match(/(\d+)\s*%\s*1RM/i);
	return m ? Number(m[1]) : null;
}

function parseHrPercentMax(s: string | undefined): number | null {
	if (!s) return null;
	// "FC 110-120 bpm" or "FC 60-70% máx" or "70% FC máx"
	const pct = s.match(/(\d+)\s*%/);
	if (pct && /FC|HR/i.test(s)) return Number(pct[1]);
	return null;
}

/* ────────── Helpers de scan no plano ────────── */

function allExercises(plan: TrainingPlanOutput): { ex: Exercise; sessionLabel: string }[] {
	const out: { ex: Exercise; sessionLabel: string }[] = [];
	for (const s of plan.weekly_sessions ?? []) {
		const label = s.label ?? '?';
		for (const ex of s.warmup ?? []) out.push({ ex, sessionLabel: label });
		for (const ex of s.main ?? []) out.push({ ex, sessionLabel: label });
		for (const ex of s.cooldown ?? []) out.push({ ex, sessionLabel: label });
	}
	return out;
}

/**
 * Strip de acentos. Em JS regex, `\b` usa definição ASCII de `\w` mesmo
 * com flag `u`. Então "pivô" + " " não é word boundary porque `ô` não
 * é \w. Normalizando NFD + removendo combining marks, "pivô" vira
 * "pivo" e `\bpiv[oô]\b` (que vira `\bpivo\b` após strip) matcheia.
 */
function stripAccents(s: string): string {
	return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function matchesPatterns(ex: Exercise, patterns: string[]): boolean {
	// Match SÓ no nome + muscle_groups — evita false positive quando
	// a IA escreve "evitar Valsalva" em execution_notes como advisory.
	const haystackRaw = [ex.name, (ex.muscle_groups ?? []).join(' ')].join(' ').toLowerCase();
	const haystack = stripAccents(haystackRaw);
	return patterns.some((p) => {
		const pNorm = stripAccents(p);
		try {
			return new RegExp(pNorm, 'i').test(haystack);
		} catch {
			return haystack.includes(pNorm.toLowerCase());
		}
	});
}

/* ────────── Validador principal ────────── */

export type Violation = {
	ruleCode: string;
	ruleTitle: string;
	severity: 'red' | 'yellow' | 'green';
	description: string;
	affectedExercises: string[];
	violationType:
		| 'forbid_pattern'
		| 'forbid_intensity'
		| 'forbid_volume'
		| 'require_monitoring'
		| 'require_clearance';
	details?: string;
};

export async function validatePlan(
	plan: TrainingPlanOutput,
	ctx: StudentCtx
): Promise<Violation[]> {
	const rules = (await db
		.select({
			code: clinicalRules.code,
			title: clinicalRules.title,
			description: clinicalRules.description,
			severity: clinicalRules.severity,
			conditionTags: clinicalRules.conditionTags,
			ruleDsl: clinicalRules.ruleDsl
		})
		.from(clinicalRules)
		.where(eq(clinicalRules.active, true))) as ClinicalRuleRow[];

	const applicable = rules.filter((r) => appliesTo(r, ctx));
	const violations: Violation[] = [];

	const exercises = allExercises(plan);
	const monitoringText = (plan.monitoring_parameters ?? [])
		.map((m) => `${m.parameter ?? ''} ${m.frequency ?? ''} ${m.alert_threshold ?? ''}`)
		.join(' ')
		.toLowerCase();

	for (const rule of applicable) {
		const dsl = rule.ruleDsl;

		// 1) forbid.exercise_patterns
		if (dsl.forbid?.exercise_patterns?.length) {
			const matched = exercises.filter((row) =>
				matchesPatterns(row.ex, dsl.forbid!.exercise_patterns!)
			);
			if (matched.length > 0) {
				violations.push({
					ruleCode: rule.code,
					ruleTitle: rule.title,
					severity: rule.severity,
					description: rule.description,
					affectedExercises: Array.from(new Set(matched.map((m) => m.ex.name))),
					violationType: 'forbid_pattern',
					details: `${matched.length} exercício(s) violam padrões proibidos`
				});
			}
		}

		// 2) forbid.intensity_above
		if (dsl.forbid?.intensity_above) {
			const { metric, value } = dsl.forbid.intensity_above;
			const offenders: { ex: Exercise; observed: number }[] = [];
			for (const { ex } of exercises) {
				// A intensidade pode estar em load_guidance OU nos campos da ficha
				// (intensity/series_label). Os parsers exigem marcadores explícitos
				// (RPE, "% 1RM", "FC %"), então combinar os campos só amplia onde
				// procurar — sem risco de falso positivo.
				const intensityText = [ex.load_guidance, ex.intensity, ex.series_label]
					.filter(Boolean)
					.join(' ');
				const observed =
					metric === 'rpe'
						? parseRpe(intensityText)
						: metric === 'percent_1rm'
							? parsePercent1RM(intensityText)
							: parseHrPercentMax(intensityText);
				if (observed != null && observed > value) {
					offenders.push({ ex, observed });
				}
			}
			if (offenders.length > 0) {
				violations.push({
					ruleCode: rule.code,
					ruleTitle: rule.title,
					severity: rule.severity,
					description: rule.description,
					affectedExercises: Array.from(new Set(offenders.map((o) => o.ex.name))),
					violationType: 'forbid_intensity',
					details: `${metric} acima de ${value} em ${offenders.length} exercício(s)`
				});
			}
		}

		// 3) forbid.volume_above
		if (dsl.forbid?.volume_above) {
			const { metric, value } = dsl.forbid.volume_above;
			let observed = 0;
			if (metric === 'sessions_per_week') {
				observed = plan.weekly_sessions?.length ?? 0;
			} else if (metric === 'minutes_per_session') {
				observed = Math.max(0, ...(plan.weekly_sessions ?? []).map((s) => s.duration_minutes ?? 0));
			}
			if (observed > value) {
				violations.push({
					ruleCode: rule.code,
					ruleTitle: rule.title,
					severity: rule.severity,
					description: rule.description,
					affectedExercises: [],
					violationType: 'forbid_volume',
					details: `${metric} = ${observed} (máximo permitido: ${value})`
				});
			}
		}

		// 4) require.monitoring
		if (dsl.require?.monitoring?.length) {
			const missing = dsl.require.monitoring.filter(
				(m) => !monitoringText.includes(m.toLowerCase())
			);
			if (missing.length > 0) {
				violations.push({
					ruleCode: rule.code,
					ruleTitle: rule.title,
					severity: rule.severity,
					description: rule.description,
					affectedExercises: [],
					violationType: 'require_monitoring',
					details: `monitoramento ausente: ${missing.join(', ')}`
				});
			}
		}

		// 5) require.medical_clearance
		if (dsl.require?.medical_clearance) {
			// Não temos um flag "medical_clearance_obtained" no DB ainda — sempre flagga
			// como pendente quando a regra exige.
			violations.push({
				ruleCode: rule.code,
				ruleTitle: rule.title,
				severity: rule.severity,
				description: rule.description,
				affectedExercises: [],
				violationType: 'require_clearance',
				details: 'liberação médica obrigatória — registrar antes de publicar'
			});
		}
	}

	logger.info(
		{
			rules_total: rules.length,
			rules_applicable: applicable.length,
			violations: violations.length,
			by_severity: violations.reduce<Record<string, number>>((acc, v) => {
				acc[v.severity] = (acc[v.severity] ?? 0) + 1;
				return acc;
			}, {})
		},
		'clinical.validate.done'
	);

	return violations;
}

/* ────────── Convertendo violation → Restriction ────────── */

export function violationToRestriction(v: Violation): Restriction {
	const typeLabel: Record<Violation['violationType'], string> = {
		forbid_pattern: 'Exercício contraindicado',
		forbid_intensity: 'Intensidade acima do permitido',
		forbid_volume: 'Volume acima do permitido',
		require_monitoring: 'Monitoramento obrigatório ausente',
		require_clearance: 'Liberação médica obrigatória'
	};
	return {
		level: v.severity,
		title: `${v.ruleTitle} · ${typeLabel[v.violationType]}`,
		description: `${v.description}${v.details ? ` · ${v.details}` : ''}`,
		affected_exercises: v.affectedExercises,
		source: {
			type: 'rule',
			rule_code: v.ruleCode
		}
	};
}

/* ────────── Convenience: deriva ctx do health_profile + age ────────── */

export type DeriveCtxArgs = {
	conditionTags: string[];
	age: number | null;
	cvRisk: CvRisk;
};

export function deriveStudentCtxFromHealth(
	conditionTags: string[],
	age: number | null,
	health: HealthProfile | null
): StudentCtx {
	return {
		conditionTags,
		age,
		cvRisk: (health?.cardiovascularRisk ?? 'baixo') as CvRisk
	};
}
