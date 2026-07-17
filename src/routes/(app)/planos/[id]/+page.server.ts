import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { audit, clientFingerprint } from '$lib/server/audit';
import { deriveTagsFromDiagnosisLabels } from '$lib/clinical/condition-tags';
import {
	getPlanDetail,
	getProfessionalByAuthId,
	getCatalogExercise,
	publishPlan,
	archivePlan,
	type PlanData,
	type PlanExercise
} from '$lib/server/queries';
import { toIntInRange } from '$lib/server/validation';
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

// Resumo de violações retornado ao form (mesmo shape em revalidate e editExercise).
type ValidationSummary = {
	violations: number;
	bySeverity: Record<string, number>;
	rules: string[];
};

// Re-roda a validação clínica do planData e persiste o merge (restrictions da IA
// preservadas, as de regra substituídas) nas DUAS colunas — restrictions e
// planData.restrictions. Reutilizada por revalidate e editExercise (#C04).
// Retorna null se o aluno não existir mais.
async function revalidateAndPersist(
	planId: string,
	studentId: string,
	planData: PlanData
): Promise<ValidationSummary | null> {
	const [s] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
	if (!s) return null;
	const [hp] = await db
		.select()
		.from(healthProfiles)
		.where(eq(healthProfiles.studentId, studentId))
		.limit(1);

	const diagnosisLabels = ((hp?.diagnoses ?? []) as { label: string }[]).map((d) => d.label);
	const conditionTags = deriveTagsFromDiagnosisLabels(diagnosisLabels);
	const age = s.birthDate
		? Math.floor((Date.now() - new Date(s.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
		: null;
	const ctx = deriveStudentCtxFromHealth(
		conditionTags.length > 0 ? conditionTags : ['populacao_geral'],
		age,
		hp ?? null
	);

	const violations = await validatePlan(planData as any, ctx);
	const ruleRestrictions: Restriction[] = violations.map(violationToRestriction);

	// Mantém restrictions da IA (source.type !== 'rule'); substitui as de regra
	const existing = (planData.restrictions ?? []) as Restriction[];
	const aiRestrictions = existing.filter((r) => r.source?.type !== 'rule');
	const merged = [...aiRestrictions, ...ruleRestrictions];

	const updatedPlanData = { ...planData, restrictions: merged };
	await db
		.update(trainingPlans)
		.set({
			restrictions: merged,
			planData: updatedPlanData,
			updatedAt: new Date()
		})
		.where(eq(trainingPlans.id, planId));

	return {
		violations: violations.length,
		bySeverity: violations.reduce<Record<string, number>>((a, v) => {
			a[v.severity] = (a[v.severity] ?? 0) + 1;
			return a;
		}, {}),
		rules: violations.map((v) => v.ruleCode)
	};
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

		const validation = await revalidateAndPersist(
			params.id!,
			plan.studentId,
			plan.planData as PlanData
		);
		if (!validation) return fail(404, { error: 'aluno não encontrado' });

		return { success: true, action: 'revalidate', validation };
	},

	// #5 — profissional edita um exercício gerado pela IA. Mutação cirúrgica
	// em planData.weekly_sessions[sessionIdx][block][exerciseIdx].
	editExercise: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const fd = await request.formData();
		const sessionIdx = Number(fd.get('sessionIdx'));
		const block = String(fd.get('block') ?? '');
		const exerciseIdx = Number(fd.get('exerciseIdx'));
		if (!['warmup', 'main', 'cooldown'].includes(block))
			return fail(400, { error: 'bloco inválido' });
		if (!Number.isInteger(sessionIdx) || !Number.isInteger(exerciseIdx))
			return fail(400, { error: 'índice inválido' });

		// Clona pra não mutar o objeto carregado; persiste o planData inteiro.
		const planData = structuredClone(plan.planData) as PlanData;
		const session = planData.weekly_sessions?.[sessionIdx];
		const blockArr = session?.[block as 'warmup' | 'main' | 'cooldown'];
		const ex = blockArr?.[exerciseIdx];
		if (!ex) return fail(404, { error: 'exercício não encontrado' });

		const name = String(fd.get('name') ?? '').trim();
		if (name.length < 2) return fail(400, { error: 'Nome do exercício inválido.' });
		const reps = String(fd.get('reps') ?? '').trim();
		const loadGuidance = String(fd.get('load_guidance') ?? '').trim();
		const intensity = String(fd.get('intensity') ?? '').trim();
		const executionNotes = String(fd.get('execution_notes') ?? '').trim();
		// Campos da ficha de prescrição — a IA quase nunca preenche cadência/
		// amplitude, então o personal controla aqui (aparecem no PDF).
		const cadence = String(fd.get('cadence') ?? '').trim();
		const rangeOfMotion = String(fd.get('range_of_motion') ?? '').trim();
		const muscleActionRaw = String(fd.get('muscle_action') ?? '').trim();
		const MUSCLE_ACTIONS = ['isotonica', 'isometrica', 'auxotonico', 'isocinetica'];
		const setsRaw = fd.get('sets');
		const restRaw = fd.get('rest_seconds');

		ex.name = name;
		if (reps) ex.reps = reps;
		if (setsRaw != null && String(setsRaw).trim() !== '')
			ex.sets = toIntInRange(setsRaw, { min: 1, max: 20, fallback: ex.sets ?? 3 });
		if (restRaw != null && String(restRaw).trim() !== '')
			ex.rest_seconds = toIntInRange(restRaw, {
				min: 0,
				max: 900,
				fallback: ex.rest_seconds ?? 60
			});
		// load_guidance / intensity / execution_notes: string vazia limpa o campo.
		ex.load_guidance = loadGuidance || undefined;
		ex.intensity = intensity || undefined;
		ex.execution_notes = executionNotes || undefined;
		ex.cadence = cadence || undefined;
		ex.range_of_motion = rangeOfMotion || undefined;
		ex.muscle_action = MUSCLE_ACTIONS.includes(muscleActionRaw)
			? (muscleActionRaw as typeof ex.muscle_action)
			: undefined;

		// Revalidação clínica automática pós-edição (#C04) — persiste o planData
		// editado + restrictions atualizadas num único update.
		const validation = await revalidateAndPersist(params.id!, plan.studentId, planData);
		if (!validation) {
			// Aluno não existe mais (edge): persiste a edição sem revalidar.
			await db
				.update(trainingPlans)
				.set({ planData, updatedAt: new Date() })
				.where(eq(trainingPlans.id, params.id!));
			return { success: true, action: 'editExercise', validation: null };
		}

		return { success: true, action: 'editExercise', validation };
	},

	// Personal TROCA um exercício da IA por outro do catálogo (com vídeo +
	// instruções). Mantém a prescrição (séries/reps/descanso/intensidade) por
	// padrão — a ideia é trocar o MOVIMENTO, não a dose. Revalida clinicamente.
	swapExercise: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const fd = await request.formData();
		const sessionIdx = Number(fd.get('sessionIdx'));
		const block = String(fd.get('block') ?? '');
		const exerciseIdx = Number(fd.get('exerciseIdx'));
		const catalogId = String(fd.get('catalogId') ?? '');
		const keep = fd.get('keepPrescription') === 'on';
		if (!['warmup', 'main', 'cooldown'].includes(block))
			return fail(400, { error: 'bloco inválido' });
		if (!Number.isInteger(sessionIdx) || !Number.isInteger(exerciseIdx))
			return fail(400, { error: 'índice inválido' });

		const cat = await getCatalogExercise(catalogId);
		if (!cat) return fail(400, { error: 'exercício do catálogo não encontrado' });

		const planData = structuredClone(plan.planData) as PlanData;
		const blockArr =
			planData.weekly_sessions?.[sessionIdx]?.[block as 'warmup' | 'main' | 'cooldown'];
		const ex = blockArr?.[exerciseIdx];
		if (!ex) return fail(404, { error: 'exercício não encontrado' });

		// Troca a IDENTIDADE (nome, catalog_id → habilita vídeo, grupos musculares).
		ex.name = cat.name;
		ex.catalog_id = /^\d{4,5}$/.test(cat.externalId) ? cat.externalId : undefined;
		ex.muscle_groups = Array.from(
			new Set([cat.targetMuscle, ...(cat.secondaryMuscles ?? [])].filter(Boolean))
		);
		// Cues clínicas eram específicas do movimento antigo — limpa (o personal
		// reescreve via editar se quiser).
		ex.execution_notes = undefined;
		if (!keep) {
			ex.sets = 3;
			ex.reps = '8-12';
			ex.rest_seconds = 60;
			ex.load_guidance = undefined;
			ex.intensity = undefined;
		}

		const validation = await revalidateAndPersist(params.id!, plan.studentId, planData);
		if (!validation) {
			await db
				.update(trainingPlans)
				.set({ planData, updatedAt: new Date() })
				.where(eq(trainingPlans.id, params.id!));
			return { success: true, action: 'swapExercise', newName: cat.name, validation: null };
		}
		return { success: true, action: 'swapExercise', newName: cat.name, validation };
	},

	// Personal ADICIONA um exercício do catálogo a um bloco da sessão.
	addExercise: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const fd = await request.formData();
		const sessionIdx = Number(fd.get('sessionIdx'));
		const block = String(fd.get('block') ?? '');
		const catalogId = String(fd.get('catalogId') ?? '');
		if (!['warmup', 'main', 'cooldown'].includes(block))
			return fail(400, { error: 'bloco inválido' });
		if (!Number.isInteger(sessionIdx)) return fail(400, { error: 'índice inválido' });

		const cat = await getCatalogExercise(catalogId);
		if (!cat) return fail(400, { error: 'exercício do catálogo não encontrado' });

		const planData = structuredClone(plan.planData) as PlanData;
		const session = planData.weekly_sessions?.[sessionIdx];
		if (!session) return fail(404, { error: 'sessão não encontrada' });
		const key = block as 'warmup' | 'main' | 'cooldown';
		if (!Array.isArray(session[key])) session[key] = [];

		const novo: PlanExercise = {
			name: cat.name,
			catalog_id: /^\d{4,5}$/.test(cat.externalId) ? cat.externalId : undefined,
			muscle_groups: Array.from(
				new Set([cat.targetMuscle, ...(cat.secondaryMuscles ?? [])].filter(Boolean))
			),
			sets: 3,
			reps: '8-12',
			rest_seconds: 60,
			source_refs: []
		};
		session[key]!.push(novo);

		const validation = await revalidateAndPersist(params.id!, plan.studentId, planData);
		if (!validation) {
			await db
				.update(trainingPlans)
				.set({ planData, updatedAt: new Date() })
				.where(eq(trainingPlans.id, params.id!));
			return { success: true, action: 'addExercise', newName: cat.name, validation: null };
		}
		return { success: true, action: 'addExercise', newName: cat.name, validation };
	},

	// Personal REMOVE um exercício. Guarda: o bloco `main` não pode ficar vazio
	// (sessão sem exercício principal não faz sentido clínico).
	removeExercise: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const fd = await request.formData();
		const sessionIdx = Number(fd.get('sessionIdx'));
		const block = String(fd.get('block') ?? '');
		const exerciseIdx = Number(fd.get('exerciseIdx'));
		if (!['warmup', 'main', 'cooldown'].includes(block))
			return fail(400, { error: 'bloco inválido' });
		if (!Number.isInteger(sessionIdx) || !Number.isInteger(exerciseIdx))
			return fail(400, { error: 'índice inválido' });

		const planData = structuredClone(plan.planData) as PlanData;
		const blockArr =
			planData.weekly_sessions?.[sessionIdx]?.[block as 'warmup' | 'main' | 'cooldown'];
		if (!blockArr || !blockArr[exerciseIdx])
			return fail(404, { error: 'exercício não encontrado' });
		if (block === 'main' && blockArr.length <= 1)
			return fail(400, { error: 'A sessão precisa de ao menos 1 exercício principal.' });

		blockArr.splice(exerciseIdx, 1);

		const validation = await revalidateAndPersist(params.id!, plan.studentId, planData);
		if (!validation) {
			await db
				.update(trainingPlans)
				.set({ planData, updatedAt: new Date() })
				.where(eq(trainingPlans.id, params.id!));
			return { success: true, action: 'removeExercise', validation: null };
		}
		return { success: true, action: 'removeExercise', validation };
	},

	// #C02 — override clínico: profissional assume responsabilidade por uma
	// restrição red e libera a publicação. Persiste resolved_* nas DUAS colunas
	// (restrictions = gate do publishPlan; planData.restrictions = o que a UI lê).
	resolveRestriction: async ({ params, request, locals, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });

		const fd = await request.formData();
		const index = Number(fd.get('index'));
		const resolutionRaw = String(fd.get('resolution') ?? 'overridden');
		if (!['overridden', 'dismissed'].includes(resolutionRaw))
			return fail(400, { error: 'resolução inválida' });
		const resolution = resolutionRaw as 'overridden' | 'dismissed';

		const planData = structuredClone(plan.planData) as PlanData;
		const pdRestrictions = (planData.restrictions ?? []) as Restriction[];
		if (!Number.isInteger(index) || index < 0 || index >= pdRestrictions.length)
			return fail(400, { error: 'restrição não encontrada' });
		const target = pdRestrictions[index]!;
		if (target.resolved_at) return fail(400, { error: 'restrição já resolvida' });

		const resolvedAt = new Date().toISOString();
		target.resolved_at = resolvedAt;
		target.resolved_by = professional.id;
		target.resolution = resolution;

		// A coluna restrictions (merge pós-guard) pode divergir do planData
		// (cru da IA) — sincroniza por título.
		const [row] = await db
			.select({ restrictions: trainingPlans.restrictions })
			.from(trainingPlans)
			.where(eq(trainingPlans.id, params.id!))
			.limit(1);
		const colRestrictions = ((row?.restrictions ?? []) as Restriction[]).map((r) =>
			r.title === target.title && !r.resolved_at
				? { ...r, resolved_at: resolvedAt, resolved_by: professional.id, resolution }
				: r
		);

		await db
			.update(trainingPlans)
			.set({ restrictions: colRestrictions, planData, updatedAt: new Date() })
			.where(eq(trainingPlans.id, params.id!));

		// Override clínico exige trilha de auditoria.
		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'plan.restriction_override',
			professionalId: professional.id,
			entityType: 'training_plan',
			entityId: params.id,
			payload: { restriction: target.title, level: target.level, resolution },
			...fp
		});

		return { success: true, action: 'resolveRestriction' };
	},

	// #M15 — reativa plano arquivado (espelho do archive; mantém publishedAt).
	unarchive: async ({ params, locals, request, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });
		if (plan.status !== 'archived')
			return fail(400, { error: 'só planos arquivados podem ser reativados' });

		await db
			.update(trainingPlans)
			.set({ status: 'published', archivedAt: null, updatedAt: new Date() })
			.where(
				and(
					eq(trainingPlans.id, params.id!),
					eq(trainingPlans.professionalId, professional.id),
					eq(trainingPlans.status, 'archived')
				)
			);

		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'plan.unarchive',
			professionalId: professional.id,
			entityType: 'training_plan',
			entityId: params.id,
			...fp
		});

		return { success: true, action: 'unarchive' };
	},

	// #M16 — exclusão de plano failed. Hard delete restrito a status 'failed'
	// com ownership (revisions têm cascade; sessions/ai_runs ficam com plan null).
	delete: async ({ params, locals, request, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const plan = await getPlanDetail(params.id!, professional.id);
		if (!plan) return fail(404, { error: 'plano não encontrado' });
		// Exclui em qualquer estado, MENOS enquanto está gerando (evita apagar um
		// registro que o job em background ainda está escrevendo).
		if (plan.status === 'pending' || plan.status === 'generating')
			return fail(400, { error: 'aguarde a geração terminar antes de excluir' });

		const res = await db
			.delete(trainingPlans)
			.where(and(eq(trainingPlans.id, params.id!), eq(trainingPlans.professionalId, professional.id)))
			.returning({ id: trainingPlans.id });
		if (res.length === 0) return fail(400, { error: 'não foi possível excluir o plano' });

		const fp = clientFingerprint(request, getClientAddress);
		audit({
			action: 'plan.delete',
			professionalId: professional.id,
			entityType: 'training_plan',
			entityId: params.id,
			...fp
		});

		redirect(303, '/planos');
	}
};
