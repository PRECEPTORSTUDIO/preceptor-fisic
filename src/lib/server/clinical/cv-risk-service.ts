/**
 * Adaptador server: monta o input do motor de risco CV a partir dos dados do
 * aluno (student + perfil de saúde + avaliação física) e devolve a sugestão.
 *
 * Mantém o motor (`$lib/clinical/cv-risk`) puro e agnóstico de DB — aqui só
 * traduzimos os tipos do Drizzle pro contrato do motor. Usa a MESMA derivação
 * de tags canônicas do generator (fonte única em `$lib/clinical/condition-tags`).
 *
 * `computeCvRiskFromParts` é o núcleo — consumido tanto pela ficha (via
 * StudentDetail) quanto pelo generator da IA (que tem os pedaços soltos).
 */
import {
	stratifyCardiovascularRisk,
	extractWaistCm,
	type CvRiskAssessment,
	type CvRiskInput
} from '$lib/clinical/cv-risk';
import { deriveTagsFromDiagnosisLabels } from '$lib/clinical/condition-tags';
import type { StudentDetail } from '$lib/server/queries';
import type { Student, HealthProfile, physicalAssessments } from '$lib/server/db/schema';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

type Assessment = typeof physicalAssessments.$inferSelect;

export function computeCvRiskFromParts(
	student: Pick<Student, 'sex' | 'birthDate' | 'weightKg' | 'heightCm'>,
	health: HealthProfile | null,
	latestAssessment: Assessment | null
): CvRiskAssessment {
	const ageYears = student.birthDate
		? Math.floor((Date.now() - new Date(student.birthDate).getTime()) / YEAR_MS)
		: null;
	const computedBmi =
		student.weightKg && student.heightCm
			? Math.round((student.weightKg / Math.pow(student.heightCm / 100, 2)) * 10) / 10
			: null;

	const diagnoses = health?.diagnoses ?? [];
	const parq = health?.parqResult ?? null;
	const parqPositive = parq ? Object.values(parq.answers ?? {}).some(Boolean) : null;

	// Cintura não tem campo estruturado — best-effort do texto (diagnósticos +
	// observações da avaliação).
	const waistCm = extractWaistCm([...diagnoses.map((d) => d.label), latestAssessment?.notes ?? '']);

	const input: CvRiskInput = {
		sex: student.sex,
		ageYears,
		bmi: latestAssessment?.bmi ?? computedBmi,
		systolicBp: latestAssessment?.bloodPressureSystolic ?? null,
		diastolicBp: latestAssessment?.bloodPressureDiastolic ?? null,
		restingHr: latestAssessment?.restingHr ?? null,
		waistCm,
		conditionTags: deriveTagsFromDiagnosisLabels(diagnoses.map((d) => d.label)),
		diagnoses: diagnoses.map((d) => ({ label: d.label, severity: d.severity })),
		medications: health?.medications ?? [],
		parqPositive
	};

	return stratifyCardiovascularRisk(input);
}

export function computeCvRisk(detail: StudentDetail): CvRiskAssessment {
	return computeCvRiskFromParts(
		detail.student,
		detail.healthProfile,
		detail.assessments[0] ?? null
	);
}
