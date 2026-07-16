/**
 * Adaptador server: monta o input do motor de risco CV a partir do
 * StudentDetail (aluno + perfil de saúde + avaliações) e devolve a sugestão.
 *
 * Mantém o motor (`$lib/clinical/cv-risk`) puro e agnóstico de DB — aqui só
 * traduzimos os tipos do Drizzle pro contrato do motor. Usa a MESMA derivação
 * de tags canônicas do generator (fonte única em ai/condition-tags).
 */
import {
	stratifyCardiovascularRisk,
	type CvRiskAssessment,
	type CvRiskInput
} from '$lib/clinical/cv-risk';
import { deriveTagsFromDiagnosisLabels } from '$lib/server/ai/condition-tags';
import type { StudentDetail } from '$lib/server/queries';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function computeCvRisk(detail: StudentDetail): CvRiskAssessment {
	const s = detail.student;
	const hp = detail.healthProfile;
	const latest = detail.assessments[0] ?? null;

	const ageYears = s.birthDate
		? Math.floor((Date.now() - new Date(s.birthDate).getTime()) / YEAR_MS)
		: null;
	const computedBmi =
		s.weightKg && s.heightCm
			? Math.round((s.weightKg / Math.pow(s.heightCm / 100, 2)) * 10) / 10
			: null;

	const diagnoses = hp?.diagnoses ?? [];
	const parq = hp?.parqResult ?? null;
	const parqPositive = parq ? Object.values(parq.answers ?? {}).some(Boolean) : null;

	const input: CvRiskInput = {
		sex: s.sex,
		ageYears,
		bmi: latest?.bmi ?? computedBmi,
		systolicBp: latest?.bloodPressureSystolic ?? null,
		diastolicBp: latest?.bloodPressureDiastolic ?? null,
		restingHr: latest?.restingHr ?? null,
		conditionTags: deriveTagsFromDiagnosisLabels(diagnoses.map((d) => d.label)),
		diagnoses: diagnoses.map((d) => ({ label: d.label, severity: d.severity })),
		medications: hp?.medications ?? [],
		parqPositive
	};

	return stratifyCardiovascularRisk(input);
}
