import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { audit, clientFingerprint } from '$lib/server/audit';
import {
	getPlanDetail,
	getProfessionalByAuthId,
	publishPlan,
	archivePlan
} from '$lib/server/queries';
import { db } from '$lib/server/db';
import { trainingPlans, students, healthProfiles, type Restriction } from '$lib/server/db/schema';
import {
	validatePlan,
	violationToRestriction,
	deriveStudentCtxFromHealth
} from '$lib/server/clinical/validator';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const plan = await getPlanDetail(params.id, professional.id);
	if (!plan) error(404, 'plano não encontrado');

	return { plan };
}) satisfies PageServerLoad;

function deriveTagsFromDiagnoses(labels: string[]): string[] {
	const tags = new Set<string>();
	for (const labelRaw of labels) {
		const label = labelRaw.toLowerCase();
		if (/hipertens|press[aã]o alta|has/.test(label)) tags.add('hipertensao_estagio_1');
		if (/diabetes/.test(label)) tags.add('diabetes_tipo_2');
		if (/cardiopat|coronar|iam|infarto|dac/.test(label)) tags.add('cardiopatia_isquemica');
		if (/insufici[eê]ncia card|icc/.test(label)) tags.add('ic_compensada');
		if (/dpoc|enfisema|bronquite/.test(label)) tags.add('dpoc_moderada');
		if (/avc|acidente vascular/.test(label)) tags.add('pos_avc');
		if (/gestante|gravida|gr[aá]vida/.test(label)) tags.add('gestante_segundo_trimestre');
		if (/idoso|fr[aá]gil/.test(label)) tags.add('idoso_fragil');
		if (/lca|cruzado/.test(label)) tags.add('lca_pos_cirurgico');
		if (/osteoartr|artrose joelho/.test(label)) tags.add('osteoartrite_joelho');
		if (/obesidade/.test(label)) tags.add('obesidade_grau_1');
		if (/c[aâ]ncer|oncolog/.test(label)) tags.add('cancer_em_tratamento');
	}
	return Array.from(tags);
}

export const actions: Actions = {
	publish: async ({ params, locals, request, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const result = await publishPlan(params.id!, professional.id);
		if (!result.ok) return fail(400, { error: result.reason });

		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'plan.publish',
			professionalId: professional.id,
			entityType: 'training_plan',
			entityId: params.id,
			...fp
		});

		return { success: true, action: 'publish' };
	},
	archive: async ({ params, locals, request, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		await archivePlan(params.id!, professional.id);

		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'plan.archive',
			professionalId: professional.id,
			entityType: 'training_plan',
			entityId: params.id,
			...fp
		});

		return { success: true, action: 'archive' };
	},
	revalidate: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const [s] = await db.select().from(students).where(eq(students.id, plan.studentId)).limit(1);
		if (!s) return fail(404, { error: 'aluno não encontrado' });
		const [hp] = await db
			.select()
			.from(healthProfiles)
			.where(eq(healthProfiles.studentId, plan.studentId))
			.limit(1);

		const diagnosisLabels = ((hp?.diagnoses ?? []) as { label: string }[]).map((d) => d.label);
		const conditionTags = deriveTagsFromDiagnoses(diagnosisLabels);
		const age = s.birthDate
			? Math.floor((Date.now() - new Date(s.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
			: null;
		const ctx = deriveStudentCtxFromHealth(
			conditionTags.length > 0 ? conditionTags : ['populacao_geral'],
			age,
			hp ?? null
		);

		const violations = await validatePlan(plan.planData as any, ctx);
		const ruleRestrictions: Restriction[] = violations.map(violationToRestriction);

		// Mantém restrictions da IA (source.type !== 'rule'); substitui as de regra
		const existing = (plan.planData?.restrictions ?? []) as Restriction[];
		const aiRestrictions = existing.filter((r) => r.source?.type !== 'rule');
		const merged = [...aiRestrictions, ...ruleRestrictions];

		const updatedPlanData = { ...plan.planData, restrictions: merged };
		await db
			.update(trainingPlans)
			.set({
				restrictions: merged,
				planData: updatedPlanData,
				updatedAt: new Date()
			})
			.where(eq(trainingPlans.id, params.id!));

		return {
			success: true,
			action: 'revalidate',
			validation: {
				violations: violations.length,
				bySeverity: violations.reduce<Record<string, number>>((a, v) => {
					a[v.severity] = (a[v.severity] ?? 0) + 1;
					return a;
				}, {}),
				rules: violations.map((v) => v.ruleCode)
			}
		};
	}
};
