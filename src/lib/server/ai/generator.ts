/**
 * Gerador de plano de treino — orquestra RAG + Gemini + persistência + auditoria.
 *
 * Pipeline:
 *   1. Carrega contexto do aluno (student + health + preferences)
 *   2. Deriva tags de condição
 *   3. RAG retrieval com ACSM > AHA preference
 *   4. generateObject (Gemini 2.5 Pro) com schema Zod
 *   5. Persiste em training_plans + ai_runs com auditoria completa
 */
import { eq } from 'drizzle-orm';
import { generateObject, streamObject } from 'ai';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { google } from './provider';
import { db } from '$lib/server/db';
import { sendPlanReady } from '$lib/server/email';
import {
	students,
	professionals,
	healthProfiles,
	trainingPreferences,
	trainingPlans,
	aiRuns,
	type Student,
	type HealthProfile,
	type Restriction,
	type MonitoringNote,
	type AssessmentProtocol
} from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import { trainingPlanSchema, type TrainingPlanOutput } from '$lib/schemas/training-plan';
import { retrieveRelevantChunks, formatContextForPrompt } from './rag';
import { SYSTEM_PROMPT_PT_BR, SYSTEM_PROMPT_VERSION } from './system-prompt';
import { validatePlan, violationToRestriction, deriveStudentCtxFromHealth } from '$lib/server/clinical/validator';

// Flash primário: 3x mais rápido que Pro, qualidade suficiente pro nosso schema.
// Pro só é tentado se Flash falhar (pouco comum).
const PRIMARY_MODEL = env.AI_MODEL_FAST ?? 'gemini-2.5-flash';
const FALLBACK_MODEL = env.AI_MODEL_PRIMARY ?? 'gemini-2.5-pro';

function isQuotaError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(msg);
}

export type GenerateOptions = {
	professionalId: string;
	studentId: string;
	planId: string;
	notes?: string;
};

export async function createPlanPlaceholder(
	studentId: string,
	professionalId: string
): Promise<string> {
	const [row] = await db
		.insert(trainingPlans)
		.values({
			studentId,
			professionalId,
			status: 'pending',
			progressPct: 5,
			progressPhase: 'enfileirado'
		})
		.returning({ id: trainingPlans.id });
	if (!row) throw new Error('Falha ao criar registro do plano.');
	return row.id;
}

type StudentContext = {
	student: Student;
	health: HealthProfile | null;
	preferences: typeof trainingPreferences.$inferSelect | null;
	conditionTags: string[];
};

function deriveConditionTags(health: HealthProfile | null): string[] {
	if (!health || (health.diagnoses ?? []).length === 0) return ['populacao_geral'];

	const tags = new Set<string>();
	if (Array.isArray(health.conditionTags)) {
		for (const t of health.conditionTags) tags.add(t);
	}

	for (const d of health.diagnoses) {
		const label = (d.label ?? '').toLowerCase();
		if (/hipertens|press[aã]o alta|has/.test(label)) {
			tags.add(d.severity === 'grave' ? 'hipertensao_estagio_2' : 'hipertensao_estagio_1');
		}
		if (/diabetes|dm1|dm 1|tipo 1/.test(label)) tags.add('diabetes_tipo_1');
		if (/diabetes|dm2|dm 2|tipo 2/.test(label)) tags.add('diabetes_tipo_2');
		if (/cardiopat|coronar|iam|infarto|dac/.test(label)) tags.add('cardiopatia_isquemica');
		if (/insufici[eê]ncia card|icc/.test(label)) tags.add('ic_compensada');
		if (/dpoc|enfisema|bronquite|pulmona/.test(label)) tags.add('dpoc_moderada');
		if (/avc|acidente vascular/.test(label)) tags.add('pos_avc');
		if (/parkinson/.test(label)) tags.add('parkinson_leve');
		if (/esclerose m/.test(label)) tags.add('esclerose_multipla');
		if (/gestante|gravida|gr[aá]vida/.test(label)) tags.add('gestante_segundo_trimestre');
		if (/idoso|fr[aá]gil|sarcopen/.test(label)) tags.add('idoso_fragil');
		if (/lca|cruzado/.test(label)) tags.add('lca_pos_cirurgico');
		if (/osteoartr|artrose joelho/.test(label)) tags.add('osteoartrite_joelho');
		if (/osteoartr.*quadril|artrose quadril/.test(label)) tags.add('osteoartrite_quadril');
		if (/dor lombar|lombalgia/.test(label)) tags.add('dor_lombar_cronica');
		if (/obesidade.*iii|grau 3|m[oó]rbida/.test(label)) tags.add('obesidade_grau_3');
		if (/obesidade/.test(label)) tags.add('obesidade_grau_1');
		if (/c[aâ]ncer|oncolog/.test(label)) tags.add('cancer_em_tratamento');
		if (/dislipid|colesterol/.test(label)) tags.add('dislipidemia');
		if (/dhgna|hep[aá]ti/.test(label)) tags.add('doenca_hepatica_compensada');
	}
	if (tags.size === 0) tags.add('populacao_geral');
	return Array.from(tags);
}

async function loadStudentContext(
	studentId: string,
	professionalId: string
): Promise<StudentContext> {
	const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
	if (!student || student.professionalId !== professionalId) {
		throw new Error('Aluno não encontrado ou não pertence a este profissional.');
	}
	const [health] = await db
		.select()
		.from(healthProfiles)
		.where(eq(healthProfiles.studentId, studentId))
		.limit(1);
	const [preferences] = await db
		.select()
		.from(trainingPreferences)
		.where(eq(trainingPreferences.studentId, studentId))
		.limit(1);

	return {
		student,
		health: health ?? null,
		preferences: preferences ?? null,
		conditionTags: deriveConditionTags(health ?? null)
	};
}

function buildUserPrompt(ctx: StudentContext, ragContext: string, notes?: string): string {
	const s = ctx.student;
	const h = ctx.health;
	const p = ctx.preferences;
	const age = s.birthDate
		? Math.floor((Date.now() - new Date(s.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
		: null;
	const bmi =
		s.weightKg && s.heightCm
			? Math.round((s.weightKg / Math.pow(s.heightCm / 100, 2)) * 10) / 10
			: null;

	const lines: string[] = [];
	lines.push('## DADOS DO ALUNO');
	lines.push(`- Nome: ${s.name}`);
	if (age !== null) lines.push(`- Idade: ${age} anos`);
	lines.push(`- Sexo: ${s.sex}`);
	if (s.weightKg) lines.push(`- Peso: ${s.weightKg} kg`);
	if (s.heightCm) lines.push(`- Altura: ${s.heightCm} cm`);
	if (bmi !== null) lines.push(`- IMC: ${bmi}`);
	lines.push('');
	lines.push('## DIAGNÓSTICOS');
	if (h && h.diagnoses && h.diagnoses.length > 0) {
		for (const d of h.diagnoses) {
			lines.push(
				`- ${d.label}${d.severity ? ` (${d.severity})` : ''}${d.since ? ` desde ${d.since}` : ''}${d.notes ? ` — ${d.notes}` : ''}`
			);
		}
	} else {
		lines.push('- (nenhum diagnóstico registrado)');
	}
	lines.push('');
	lines.push('## MEDICAMENTOS');
	if (h && h.medications && h.medications.length > 0) {
		for (const m of h.medications) {
			lines.push(`- ${m.name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` · ${m.frequency}` : ''}`);
		}
	} else {
		lines.push('- (sem medicamentos em uso)');
	}
	lines.push('');
	lines.push(`## RISCO CARDIOVASCULAR: ${h?.cardiovascularRisk ?? 'baixo'}`);
	lines.push('');
	lines.push('## TAGS DE CONDIÇÃO (canônicas, derivadas dos diagnósticos)');
	lines.push(`- ${ctx.conditionTags.join(', ')}`);
	lines.push('');
	lines.push('## PREFERÊNCIAS DE TREINO');
	if (p) {
		lines.push(`- Experiência: ${p.experienceLevel}`);
		lines.push(`- Frequência: ${p.weeklySessions}x/semana, ${p.minutesPerSession} min/sessão`);
		lines.push(`- Objetivos: ${(p.goals ?? []).join(', ')}`);
		if ((p.preferredModalities ?? []).length > 0)
			lines.push(`- Modalidades preferidas: ${p.preferredModalities.join(', ')}`);
		if ((p.equipmentAvailable ?? []).length > 0)
			lines.push(`- Equipamento disponível: ${p.equipmentAvailable.join(', ')}`);
		if (p.notes) lines.push(`- Notas: ${p.notes}`);
	} else {
		lines.push('- (preferências não registradas — assumir iniciante, 3x/sem, 60min)');
	}
	lines.push('');
	if (notes) {
		lines.push('## OBSERVAÇÕES DO PROFISSIONAL');
		lines.push(notes);
		lines.push('');
	}
	lines.push('## CONTEXTO CLÍNICO (chunks recuperados via RAG)');
	lines.push('NOTA: Chunks marcados com ★ ALTA PREFERÊNCIA são ACSM e devem ter PRIORIDADE.');
	lines.push('Chunks marcados com ○ baixa são AHA — usar apenas se ACSM não cobrir o ponto.');
	lines.push('');
	lines.push(ragContext);
	lines.push('');
	lines.push('## TAREFA');
	lines.push(
		'Gere um plano de treino semanal estruturado conforme o schema. Para cada recomendação crítica, cite chunk_id do CONTEXTO CLÍNICO acima — preferindo chunks ACSM quando disponíveis. Se não estiver coberto, marque source.type = "inference".'
	);

	return lines.join('\n');
}

export type GenerateResult = {
	planId: string;
	aiRunId: string;
	durationMs: number;
	chunkIds: string[];
};

export async function generateTrainingPlan(opts: GenerateOptions): Promise<GenerateResult> {
	const correlationId = randomUUID();
	const planId = opts.planId;
	const log = logger.child({ correlationId, studentId: opts.studentId, planId });
	const startMs = Date.now();
	let modelUsed = PRIMARY_MODEL;

	log.info({ professionalId: opts.professionalId }, 'plan.generate.start');

	try {
		await db
			.update(trainingPlans)
			.set({
				status: 'generating',
				progressPct: 15,
				progressPhase: 'carregando contexto clínico',
				updatedAt: new Date()
			})
			.where(eq(trainingPlans.id, planId));

		const ctx = await loadStudentContext(opts.studentId, opts.professionalId);

		await db
			.update(trainingPlans)
			.set({ progressPct: 35, progressPhase: 'recuperando RAG (preferência ACSM)' })
			.where(eq(trainingPlans.id, planId));

		const chunks = await retrieveRelevantChunks({
			conditionTags: ctx.conditionTags,
			goals: (ctx.preferences?.goals ?? []) as string[],
			freeText: opts.notes,
			topK: 8
		});
		const ragContext = formatContextForPrompt(chunks);
		const chunkIds = chunks.map((c) => c.chunk_id);
		const orgDistribution = chunks.reduce<Record<string, number>>((acc, c) => {
			acc[c.source_organization] = (acc[c.source_organization] ?? 0) + 1;
			return acc;
		}, {});

		log.info({ chunks: chunkIds.length, orgDistribution }, 'rag.context.ready');

		await db
			.update(trainingPlans)
			.set({
				progressPct: 55,
				progressPhase: `gerando plano com ${PRIMARY_MODEL.replace(/^gemini-/, 'Gemini ')}`
			})
			.where(eq(trainingPlans.id, planId));

		const userPrompt = buildUserPrompt(ctx, ragContext, opts.notes);
		const genStartMs = Date.now();

		// streamObject = AI gera incrementalmente. Persistimos partial no DB
		// throttled (a cada 700ms) pra UI mostrar o plano materializando em tempo real.
		// Se Flash der quota, fallback pra Pro com generateObject (não-streaming).
		let plan: TrainingPlanOutput;
		let usage: { inputTokens?: number; outputTokens?: number } | undefined;

		const streamPlan = async (model: string) => {
			let lastWriteAt = 0;
			let lastSessionsCount = 0;
			const result = streamObject({
				model: google(model),
				schema: trainingPlanSchema,
				schemaName: 'TrainingPlan',
				schemaDescription:
					'Plano de treino clínico com sessões semanais, monitoramento, restrições e citações',
				system: SYSTEM_PROMPT_PT_BR,
				prompt: userPrompt,
				maxRetries: 1
			});

			for await (const partial of result.partialObjectStream) {
				const now = Date.now();
				const sessions = (partial as { weekly_sessions?: unknown[] }).weekly_sessions ?? [];
				const sessionsCount = Array.isArray(sessions) ? sessions.length : 0;

				// Throttle: escreve no DB a cada 700ms OU quando uma nova sessão completa aparece.
				if (now - lastWriteAt < 700 && sessionsCount === lastSessionsCount) continue;
				lastWriteAt = now;
				lastSessionsCount = sessionsCount;

				// Progresso simulado: 55 → 90 baseado em fração de output esperada
				// Usa contagem de sessões (esperado 2-4) + presença de monitoring
				const targetSessions = 3;
				const sessionsFrac = Math.min(1, sessionsCount / targetSessions);
				const hasMonitoring =
					Array.isArray((partial as { monitoring_parameters?: unknown[] }).monitoring_parameters) &&
					((partial as { monitoring_parameters?: unknown[] }).monitoring_parameters?.length ?? 0) >
						0;
				const monitFrac = hasMonitoring ? 0.15 : 0;
				const pct = Math.min(90, 55 + Math.round((sessionsFrac * 0.7 + monitFrac) * 35));

				const phase =
					sessionsCount === 0
						? 'estruturando plano clínico'
						: sessionsCount < targetSessions
							? `bloco ${sessionsCount} de ${targetSessions}: compondo exercícios`
							: 'finalizando monitoramento e restrições';

				await db
					.update(trainingPlans)
					.set({
						progressPct: pct,
						progressPhase: phase,
						planData: partial as TrainingPlanOutput,
						updatedAt: new Date()
					})
					.where(eq(trainingPlans.id, planId))
					.catch(() => {}); // ignora write conflicts entre throttle ticks
			}

			return { object: await result.object, usage: await result.usage };
		};

		try {
			const r = await streamPlan(PRIMARY_MODEL);
			plan = r.object;
			usage = r.usage;
		} catch (primaryErr) {
			if (!isQuotaError(primaryErr)) throw primaryErr;
			log.warn(
				{ err: String(primaryErr).slice(0, 200) },
				'plan.generate.primary_quota_fallback'
			);
			await db
				.update(trainingPlans)
				.set({
					progressPhase: `${PRIMARY_MODEL.replace(/^gemini-/, '')} com quota cheia → tentando ${FALLBACK_MODEL.replace(/^gemini-/, '')}`
				})
				.where(eq(trainingPlans.id, planId));
			// Fallback NÃO streaming pra simplicidade — Pro raramente é tocado
			const fallbackGen = await generateObject({
				model: google(FALLBACK_MODEL),
				schema: trainingPlanSchema,
				schemaName: 'TrainingPlan',
				schemaDescription:
					'Plano de treino clínico com sessões semanais, monitoramento, restrições e citações',
				system: SYSTEM_PROMPT_PT_BR,
				prompt: userPrompt,
				maxRetries: 2
			});
			plan = fallbackGen.object;
			usage = fallbackGen.usage;
			modelUsed = FALLBACK_MODEL;
		}
		const genElapsed = Date.now() - genStartMs;

		await db
			.update(trainingPlans)
			.set({ progressPct: 90, progressPhase: 'validando e persistindo' })
			.where(eq(trainingPlans.id, planId));

		// Restrições da IA
		const aiRestrictions: Restriction[] = plan.restrictions.map((r) => ({
			level: r.level,
			title: r.title,
			description: r.description,
			affected_exercises: r.affected_exercises,
			suggestion: r.suggestion,
			source: {
				type: r.source.type,
				ref: r.source.note,
				rule_code: r.source.rule_code,
				chunk_id: r.source.chunk_id,
				source_id: r.source.source_id
			}
		}));

		// Validação clínica via clinical_rules engine
		await db
			.update(trainingPlans)
			.set({ progressPct: 80, progressPhase: 'validando contra clinical_rules' })
			.where(eq(trainingPlans.id, planId));

		const age = ctx.student.birthDate
			? Math.floor(
					(Date.now() - new Date(ctx.student.birthDate).getTime()) /
						(365.25 * 24 * 60 * 60 * 1000)
				)
			: null;
		const studentCtx = deriveStudentCtxFromHealth(ctx.conditionTags, age, ctx.health);
		const violations = await validatePlan(plan, studentCtx);
		const ruleRestrictions: Restriction[] = violations.map(violationToRestriction);

		// Merge — IA primeiro, regras automáticas depois (com source.type='rule' fica claro)
		const restrictions: Restriction[] = [...aiRestrictions, ...ruleRestrictions];

		log.info(
			{ ai_restrictions: aiRestrictions.length, rule_violations: violations.length },
			'plan.validate.done'
		);
		const monitoringNotes: MonitoringNote[] = plan.monitoring_parameters.map((m) => ({
			parameter: m.parameter,
			frequency: m.frequency,
			alert_threshold: m.alert_threshold,
			source_refs: m.source_refs.map((s) => s.chunk_id ?? s.source_id ?? s.note ?? '').filter(Boolean)
		}));
		const assessmentProtocols: AssessmentProtocol[] = plan.assessment_protocols.map((a) => ({
			test_name: a.test_name,
			when: a.when,
			source_refs: a.source_refs.map((s) => s.chunk_id ?? s.source_id ?? s.note ?? '').filter(Boolean)
		}));

		const [aiRunRow] = await db
			.insert(aiRuns)
			.values({
				professionalId: opts.professionalId,
				studentId: opts.studentId,
				planId,
				kind: 'plan_generation',
				model: modelUsed,
				provider: 'google',
				input: {
					system_prompt_version: SYSTEM_PROMPT_VERSION,
					user_prompt: userPrompt,
					rag_chunk_ids: chunkIds,
					rag_org_distribution: orgDistribution,
					condition_tags: ctx.conditionTags,
					notes: opts.notes ?? null
				},
				output: plan,
				tokensInput: usage?.inputTokens ?? null,
				tokensOutput: usage?.outputTokens ?? null,
				latencyMs: genElapsed,
				status: 'success',
				correlationId
			})
			.returning({ id: aiRuns.id });
		if (!aiRunRow) throw new Error('Falha ao registrar ai_run.');

		await db
			.update(trainingPlans)
			.set({
				status: 'generated',
				progressPct: 100,
				progressPhase: 'concluído',
				planData: plan,
				planSummary: plan.summary,
				restrictions,
				monitoringNotes,
				assessmentProtocols,
				aiRunId: aiRunRow.id,
				generatedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(trainingPlans.id, planId));

		const totalElapsed = Date.now() - startMs;
		log.info(
			{
				planId,
				aiRunId: aiRunRow.id,
				model: modelUsed,
				chunks: chunkIds.length,
				orgDistribution,
				restrictions: restrictions.length,
				monitoring: monitoringNotes.length,
				gen_ms: genElapsed,
				total_ms: totalElapsed,
				input_tokens: usage?.inputTokens,
				output_tokens: usage?.outputTokens
			},
			'plan.generate.success'
		);

		// Email pro profissional avisando que o plano tá pronto.
		// Fire-and-forget — falha de email não impacta o flow.
		try {
			const [prof] = await db
				.select({ name: professionals.name, email: professionals.email })
				.from(professionals)
				.where(eq(professionals.id, opts.professionalId))
				.limit(1);
			if (prof?.email) {
				sendPlanReady({
					to: prof.email,
					professionalName: prof.name,
					studentName: ctx.student.name,
					planId
				}).catch((err) =>
					log.error({ err: String(err).slice(0, 200) }, 'plan.ready.email.failed')
				);
			}
		} catch (err) {
			log.error({ err: String(err).slice(0, 200) }, 'plan.ready.email.lookup_failed');
		}

		return { planId, aiRunId: aiRunRow.id, durationMs: totalElapsed, chunkIds };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ err, planId }, 'plan.generate.failed');

		await db
			.insert(aiRuns)
			.values({
				professionalId: opts.professionalId,
				studentId: opts.studentId,
				planId,
				kind: 'plan_generation',
				model: modelUsed,
				provider: 'google',
				input: {
					system_prompt_version: SYSTEM_PROMPT_VERSION,
					user_prompt: '(suprimido em falha)',
					notes: opts.notes ?? null
				},
				output: null,
				status: 'error',
				error: message.slice(0, 1000),
				correlationId
			})
			.catch(() => {});

		await db
			.update(trainingPlans)
			.set({
				status: 'failed',
				progressPct: 0,
				progressPhase: 'erro',
				errorMessage: message.slice(0, 500),
				updatedAt: new Date()
			})
			.where(eq(trainingPlans.id, planId));

		throw err;
	}
}

/**
 * "Background" no Vercel = waitUntil() do @vercel/functions.
 * Sem isso, a serverless function morre assim que a action retorna o redirect,
 * matando a Promise órfã e deixando o plano em status 'pending' pra sempre.
 *
 * waitUntil estende o lifetime da invocação até a Promise resolver,
 * limitado pelo maxDuration do route (60s no Hobby, 300s no Pro).
 *
 * Em local dev (não-Vercel), waitUntil é no-op e o microtask roda normal —
 * Node fica vivo segurando a Promise.
 */
export function generateTrainingPlanInBackground(opts: GenerateOptions): void {
	const promise = generateTrainingPlan(opts).catch((err) => {
		logger.error(
			{ err, planId: opts.planId, studentId: opts.studentId },
			'plan.generate.background.failed'
		);
	});
	try {
		waitUntil(promise);
	} catch {
		// Fora do contexto Vercel (ex: dev local): waitUntil lança.
		// Promise continua rodando normalmente porque Node não termina.
	}
}
