/**
 * Schema único do PreceptorFISIC. Fonte de verdade exclusiva.
 * Portado da v2 (FisioMentor). Compatível com migração via pg_dump/restore.
 *
 * Gere migrations com `pnpm db:generate` e aplique com `pnpm db:migrate`.
 * Nunca crie/altere tabela via SQL manual no Supabase Studio.
 */
import {
	pgTable,
	pgEnum,
	uuid,
	text,
	integer,
	real,
	boolean,
	timestamp,
	jsonb,
	date,
	vector,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';

/* Enums */

export const specialtyEnum = pgEnum('specialty', [
	'prescricao_clinica',
	'treinamento_funcional',
	'reabilitacao',
	'musculacao',
	'personal',
	'pilates',
	'outro'
]);

export const sexEnum = pgEnum('sex', ['feminino', 'masculino', 'outro', 'nao_informado']);

export const riskEnum = pgEnum('cardiovascular_risk', ['baixo', 'moderado', 'alto', 'muito_alto']);

export const experienceEnum = pgEnum('experience_level', [
	'iniciante',
	'intermediario',
	'avancado'
]);

/**
 * Dificuldade-alvo dos exercícios prescritos. Independente do nível de
 * experiência: um aluno intermediário novo numa academia pode pedir
 * dificuldade pequena pra não receber exercícios complexos demais.
 */
export const prescribedDifficultyEnum = pgEnum('prescribed_difficulty', [
	'pequena',
	'media',
	'alta'
]);

/**
 * Estrutura semanal do treino. `auto` deixa a IA decidir com base em
 * frequência + experiência. Os outros 3 cobrem ~95% dos casos:
 *  - full_body: todos os grupos em toda sessão (1-3x/sem, iniciante)
 *  - upper_lower: alterna superior/inferior (4x/sem)
 *  - push_pull_legs: clássico hipertrofia (4-6x/sem)
 */
export const trainingSplitEnum = pgEnum('training_split', [
	'auto',
	'full_body',
	'upper_lower',
	'push_pull_legs'
]);

export const planStatusEnum = pgEnum('plan_status', [
	'pending',
	'generating',
	'generated',
	'published',
	'archived',
	'failed'
]);

export const severityEnum = pgEnum('severity', ['red', 'yellow', 'green']);

export const aiRunKindEnum = pgEnum('ai_run_kind', [
	'plan_generation',
	'validation',
	'summary',
	'embedding',
	'rerank',
	'condition_tagging'
]);

export const aiRunStatusEnum = pgEnum('ai_run_status', [
	'success',
	'error',
	'timeout',
	'validation_failed'
]);

export const sourceCategoryEnum = pgEnum('source_category', [
	'diretriz_oficial',
	'estudo_clinico',
	'revisao_sistematica',
	'posicionamento',
	'guia_pratico'
]);

export const organizationEnum = pgEnum('organization', [
	'acsm',
	'aha',
	'ada',
	'oms',
	'esc',
	'essa',
	'sbc',
	'sbd',
	'sbmfe',
	'ministerio_saude',
	'outro'
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
	'trial',
	'active',
	'past_due',
	'cancelled',
	'inactive'
]);

/* professionals */
export const professionals = pgTable(
	'professionals',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		authUserId: uuid('auth_user_id').notNull().unique(),
		email: text('email').notNull().unique(),
		name: text('name').notNull(),
		cref: text('cref'),
		specialty: specialtyEnum('specialty').default('prescricao_clinica').notNull(),
		avatarUrl: text('avatar_url'),
		onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
		/** Acesso ao CRM interno do PreceptorFISIC. Flipar via SQL no Supabase. */
		isAdmin: boolean('is_admin').default(false).notNull(),
		aiPreferences: jsonb('ai_preferences')
			.$type<{
				default_modality: 'musculacao' | 'aerobio' | 'ambos';
				detail_level: 'sintetico' | 'detalhado';
				include_assessment_protocols: boolean;
			}>()
			.default({
				default_modality: 'ambos',
				detail_level: 'detalhado',
				include_assessment_protocols: true
			})
			.notNull(),
		subscriptionStatus: subscriptionStatusEnum('subscription_status').default('trial').notNull(),
		subscriptionPlan: text('subscription_plan'),
		subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
		/** Customer no Asaas (cus_...) — criado na 1ª assinatura de dentro do app.
		 *  Permite match determinístico no webhook (não depende do email digitado). */
		asaasCustomerId: text('asaas_customer_id').unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('professionals_email_idx').on(t.email)]
);

/* students */
export const students = pgTable(
	'students',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		birthDate: date('birth_date'),
		sex: sexEnum('sex').default('nao_informado').notNull(),
		weightKg: real('weight_kg'),
		heightCm: real('height_cm'),
		avatarUrl: text('avatar_url'),
		phone: text('phone'),
		email: text('email'),
		consentAcceptedAt: timestamp('consent_accepted_at', { withTimezone: true }),
		consentTermsVersion: text('consent_terms_version'),
		/**
		 * Quando o perfil ficou completo. Null = aluno criado via link de
		 * auto-preenchimento e ainda não preencheu os próprios dados.
		 */
		profileCompletedAt: timestamp('profile_completed_at', { withTimezone: true }),
		/**
		 * Versão do magic-link do aluno (ver aluno-token.ts). Incrementar
		 * revoga o link atual daquele aluno sem afetar os demais.
		 */
		linkTokenVersion: integer('link_token_version').default(1).notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('students_professional_idx').on(t.professionalId),
		index('students_deleted_idx').on(t.deletedAt)
	]
);

/* health_profiles */
export type Diagnosis = {
	code?: string;
	label: string;
	severity?: 'leve' | 'moderada' | 'grave';
	since?: string;
	notes?: string;
};
export type Medication = { name: string; dose?: string; frequency?: string; notes?: string };
export type Surgery = { procedure: string; date?: string; notes?: string };
export type Injury = { region: string; since?: string; current_pain_0_10?: number; notes?: string };
export type ParqResult = {
	answers: Record<string, boolean>;
	parmed_x?: Record<string, unknown>;
	completed_at: string;
};
export type Contraindication = { exercise_pattern: string; reason: string; source?: string };

export const healthProfiles = pgTable(
	'health_profiles',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' })
			.unique(),
		diagnoses: jsonb('diagnoses').$type<Diagnosis[]>().default([]).notNull(),
		surgeries: jsonb('surgeries').$type<Surgery[]>().default([]).notNull(),
		medications: jsonb('medications').$type<Medication[]>().default([]).notNull(),
		injuries: jsonb('injuries').$type<Injury[]>().default([]).notNull(),
		parqResult: jsonb('parq_result').$type<ParqResult | null>(),
		cardiovascularRisk: riskEnum('cardiovascular_risk').default('baixo').notNull(),
		contraindications: jsonb('contraindications').$type<Contraindication[]>().default([]).notNull(),
		conditionTags: jsonb('condition_tags').$type<string[]>().default([]).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [index('health_profiles_student_idx').on(t.studentId)]
);

/* training_preferences */
export const trainingPreferences = pgTable(
	'training_preferences',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' })
			.unique(),
		experienceLevel: experienceEnum('experience_level').default('iniciante').notNull(),
		prescribedDifficulty: prescribedDifficultyEnum('prescribed_difficulty')
			.default('media')
			.notNull(),
		trainingSplit: trainingSplitEnum('training_split').default('auto').notNull(),
		preferredModalities: jsonb('preferred_modalities').$type<string[]>().default([]).notNull(),
		weeklySessions: integer('weekly_sessions').default(3).notNull(),
		minutesPerSession: integer('minutes_per_session').default(60).notNull(),
		goals: jsonb('goals').$type<string[]>().default([]).notNull(),
		equipmentAvailable: jsonb('equipment_available').$type<string[]>().default([]).notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [index('training_preferences_student_idx').on(t.studentId)]
);

/* physical_assessments */
export type FitnessTest = { name: string; value: number; unit: string; notes?: string };

export const physicalAssessments = pgTable(
	'physical_assessments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		createdBy: uuid('created_by')
			.notNull()
			.references(() => professionals.id, { onDelete: 'restrict' }),
		assessedAt: timestamp('assessed_at', { withTimezone: true }).defaultNow().notNull(),
		bodyFatPct: real('body_fat_pct'),
		leanMassKg: real('lean_mass_kg'),
		bmi: real('bmi'),
		restingHr: integer('resting_hr'),
		bloodPressureSystolic: integer('blood_pressure_systolic'),
		bloodPressureDiastolic: integer('blood_pressure_diastolic'),
		fitnessTests: jsonb('fitness_tests').$type<FitnessTest[]>().default([]).notNull(),
		attachments: jsonb('attachments').$type<string[]>().default([]).notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('physical_assessments_student_idx').on(t.studentId),
		index('physical_assessments_assessed_at_idx').on(t.assessedAt)
	]
);

/* training_plans */
export type Restriction = {
	level: 'red' | 'yellow' | 'green';
	title: string;
	description: string;
	affected_exercises: string[];
	suggestion?: string;
	source: {
		type: 'guideline' | 'rule' | 'rag_chunk' | 'inference';
		ref?: string;
		rule_code?: string;
		chunk_id?: string;
		source_id?: string;
	};
	resolved_at?: string;
	resolved_by?: string;
	resolution?: 'substituted' | 'overridden' | 'dismissed';
};
export type MonitoringNote = {
	parameter: string;
	frequency: string;
	alert_threshold?: string;
	source_refs?: string[];
};
export type AssessmentProtocol = { test_name: string; when: string; source_refs?: string[] };

export const trainingPlans = pgTable(
	'training_plans',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'restrict' }),
		status: planStatusEnum('status').default('pending').notNull(),
		planData: jsonb('plan_data').$type<unknown>(),
		planSummary: text('plan_summary'),
		restrictions: jsonb('restrictions').$type<Restriction[]>().default([]).notNull(),
		monitoringNotes: jsonb('monitoring_notes').$type<MonitoringNote[]>().default([]).notNull(),
		assessmentProtocols: jsonb('assessment_protocols')
			.$type<AssessmentProtocol[]>()
			.default([])
			.notNull(),
		overrideNotes: text('override_notes'),
		aiRunId: uuid('ai_run_id'),
		errorMessage: text('error_message'),
		progressPct: integer('progress_pct').default(0).notNull(),
		progressPhase: text('progress_phase'),
		/** Texto bruto sendo gerado pela IA (textStream do AI SDK) —
		 *  alimenta a UI "Gemini escrevendo" em tempo real. Truncado
		 *  em ~6KB pelo backend (suficiente pra renderizar tela cheia). */
		streamText: text('stream_text'),
		generatedAt: timestamp('generated_at', { withTimezone: true }),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('training_plans_student_idx').on(t.studentId),
		index('training_plans_professional_idx').on(t.professionalId),
		index('training_plans_status_idx').on(t.status)
	]
);

export const trainingPlanRevisions = pgTable(
	'training_plan_revisions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		planId: uuid('plan_id')
			.notNull()
			.references(() => trainingPlans.id, { onDelete: 'cascade' }),
		revisionNumber: integer('revision_number').notNull(),
		planData: jsonb('plan_data').$type<unknown>(),
		editedBy: uuid('edited_by')
			.notNull()
			.references(() => professionals.id, { onDelete: 'restrict' }),
		changeSummary: text('change_summary'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('plan_revisions_unique_idx').on(t.planId, t.revisionNumber),
		index('plan_revisions_plan_idx').on(t.planId)
	]
);

/* training_sessions */
export type ExerciseLog = {
	exercise_id: string;
	name?: string;
	sets_done: number;
	reps_done: string;
	load_used?: string;
	/**
	 * Peso e reps reais de cada série executada — fonte de verdade pra carga
	 * externa (Σ peso×reps). Opcional pra compat com logs antigos que só tinham
	 * load_used em texto livre.
	 */
	set_logs?: { weight: number; reps: number }[];
	notes?: string;
	completed: boolean;
};

export const trainingSessions = pgTable(
	'training_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		planId: uuid('plan_id').references(() => trainingPlans.id, { onDelete: 'set null' }),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		loggedBy: uuid('logged_by')
			.notNull()
			.references(() => professionals.id, { onDelete: 'restrict' }),
		sessionDate: timestamp('session_date', { withTimezone: true }).defaultNow().notNull(),
		sessionLabel: text('session_label'),
		exercisesDone: jsonb('exercises_done').$type<ExerciseLog[]>().default([]).notNull(),
		perceivedEffort: integer('perceived_effort'),
		/** Duração real da sessão em minutos. Alimenta session-RPE (carga interna). */
		durationMinutes: integer('duration_minutes'),
		observations: text('observations'),
		attachments: jsonb('attachments').$type<string[]>().default([]).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('training_sessions_student_idx').on(t.studentId),
		index('training_sessions_plan_idx').on(t.planId),
		index('training_sessions_date_idx').on(t.sessionDate)
	]
);

export const progressRecords = pgTable(
	'progress_records',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		assessmentId: uuid('assessment_id').references(() => physicalAssessments.id, {
			onDelete: 'set null'
		}),
		metricType: text('metric_type').notNull(),
		value: real('value').notNull(),
		unit: text('unit').notNull(),
		recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('progress_records_student_idx').on(t.studentId),
		index('progress_records_metric_idx').on(t.studentId, t.metricType, t.recordedAt)
	]
);

export const studentDrafts = pgTable(
	'student_drafts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'cascade' }),
		draftData: jsonb('draft_data').$type<unknown>().notNull(),
		currentStep: integer('current_step').default(1).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [index('student_drafts_professional_idx').on(t.professionalId)]
);

/* RAG */
export const knowledgeSources = pgTable(
	'knowledge_sources',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull(),
		authors: jsonb('authors').$type<string[]>().default([]).notNull(),
		publisher: text('publisher'),
		year: integer('year'),
		doi: text('doi'),
		url: text('url'),
		category: sourceCategoryEnum('category').default('diretriz_oficial').notNull(),
		organization: organizationEnum('organization').default('outro').notNull(),
		populationTags: jsonb('population_tags').$type<string[]>().default([]).notNull(),
		fileHash: text('file_hash').notNull().unique(),
		storagePath: text('storage_path'),
		pageCount: integer('page_count'),
		language: text('language').default('pt-BR').notNull(),
		ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
		lastReingestedAt: timestamp('last_reingested_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('knowledge_sources_hash_idx').on(t.fileHash),
		index('knowledge_sources_org_idx').on(t.organization)
	]
);

export const knowledgeChunks = pgTable(
	'knowledge_chunks',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sourceId: uuid('source_id')
			.notNull()
			.references(() => knowledgeSources.id, { onDelete: 'cascade' }),
		pageNumber: integer('page_number'),
		chunkIndex: integer('chunk_index').notNull(),
		content: text('content').notNull(),
		contentHash: text('content_hash').notNull(),
		embedding: vector('embedding', { dimensions: 768 }),
		metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
		tokens: integer('tokens'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('knowledge_chunks_content_idx').on(t.sourceId, t.contentHash),
		index('knowledge_chunks_source_idx').on(t.sourceId),
		index('knowledge_chunks_embedding_idx').using('ivfflat', t.embedding.op('vector_cosine_ops'))
	]
);

/* AI runs / clinical rules / taxonomy / audit */
export const aiRuns = pgTable(
	'ai_runs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id').references(() => professionals.id, {
			onDelete: 'set null'
		}),
		studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
		planId: uuid('plan_id').references(() => trainingPlans.id, { onDelete: 'set null' }),
		kind: aiRunKindEnum('kind').notNull(),
		model: text('model').notNull(),
		provider: text('provider').notNull(),
		input: jsonb('input').$type<unknown>().notNull(),
		output: jsonb('output').$type<unknown>(),
		tokensInput: integer('tokens_input'),
		tokensOutput: integer('tokens_output'),
		latencyMs: integer('latency_ms'),
		costUsd: real('cost_usd'),
		status: aiRunStatusEnum('status').notNull(),
		error: text('error'),
		retries: integer('retries').default(0).notNull(),
		correlationId: text('correlation_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('ai_runs_professional_idx').on(t.professionalId),
		index('ai_runs_plan_idx').on(t.planId),
		index('ai_runs_kind_idx').on(t.kind),
		index('ai_runs_status_idx').on(t.status),
		index('ai_runs_created_idx').on(t.createdAt)
	]
);

export type RuleDSL = {
	when: {
		condition_tags_any?: string[];
		condition_tags_all?: string[];
		age_gte?: number;
		age_lte?: number;
		cv_risk_min?: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	};
	forbid?: {
		exercise_patterns?: string[];
		intensity_above?: { metric: 'rpe' | 'percent_1rm' | 'hr_percent_max'; value: number };
		volume_above?: { metric: 'sessions_per_week' | 'minutes_per_session'; value: number };
	};
	require?: { monitoring?: string[]; medical_clearance?: boolean };
	suggest_replacement?: Record<string, string[]>;
};

export const clinicalRules = pgTable(
	'clinical_rules',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		code: text('code').notNull().unique(),
		title: text('title').notNull(),
		description: text('description').notNull(),
		conditionTags: jsonb('condition_tags').$type<string[]>().default([]).notNull(),
		ruleDsl: jsonb('rule_dsl').$type<RuleDSL>().notNull(),
		severity: severityEnum('severity').default('yellow').notNull(),
		sourceRefs: jsonb('source_refs').$type<string[]>().default([]).notNull(),
		active: boolean('active').default(true).notNull(),
		version: integer('version').default(1).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('clinical_rules_code_idx').on(t.code),
		index('clinical_rules_active_idx').on(t.active)
	]
);

export const conditionTaxonomy = pgTable(
	'condition_taxonomy',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tag: text('tag').notNull().unique(),
		label: text('label').notNull(),
		category: text('category').notNull(),
		synonyms: jsonb('synonyms').$type<string[]>().default([]).notNull(),
		icd10: text('icd10'),
		description: text('description'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('condition_taxonomy_tag_idx').on(t.tag)]
);

export const auditLog = pgTable(
	'audit_log',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id').references(() => professionals.id, {
			onDelete: 'set null'
		}),
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityId: uuid('entity_id'),
		payload: jsonb('payload').$type<Record<string, unknown>>(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		correlationId: text('correlation_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('audit_log_professional_idx').on(t.professionalId),
		index('audit_log_action_idx').on(t.action),
		index('audit_log_created_idx').on(t.createdAt)
	]
);

/* ────────── exercise_library (biblioteca de exercícios do profissional) ────────── */
export const exerciseLibrary = pgTable(
	'exercise_library',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'cascade' }),
		code: text('code'),
		name: text('name').notNull(),
		muscleGroup: text('muscle_group').notNull(),
		equipment: text('equipment'),
		level: text('level'),
		pattern: text('pattern'),
		description: text('description'),
		executionNotes: text('execution_notes'),
		videoUrl: text('video_url'),
		contraindications: jsonb('contraindications').$type<string[]>().default([]).notNull(),
		uses: integer('uses').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('exercise_library_pro_idx').on(t.professionalId),
		index('exercise_library_group_idx').on(t.muscleGroup)
	]
);

/* ────────── exercise_catalog (catálogo global ExerciseDB Pro — read-only) ──────────
   Diferente da exercise_library (custom por profissional), o catálogo é
   compartilhado: 1.324 exercícios licenciados com vídeo demonstrativo.
   A IA recomenda destes; o profissional pode complementar com os custom dele. */
export const exerciseCatalog = pgTable(
	'exercise_catalog',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		externalId: text('external_id').notNull().unique(), // "0001" do ExerciseDB Pro
		name: text('name').notNull(), // PT-BR (traduzido)
		nameEn: text('name_en').notNull(), // original EN — matching com output da IA
		bodyPart: text('body_part').notNull(),
		targetMuscle: text('target_muscle').notNull(),
		secondaryMuscles: jsonb('secondary_muscles').$type<string[]>().default([]).notNull(),
		equipment: text('equipment'),
		difficulty: text('difficulty'), // beginner | intermediate | advanced
		category: text('category'), // strength | stretching | mobility | cardio | ...
		instructions: jsonb('instructions').$type<string[]>().default([]).notNull(), // PT-BR
		instructionsEn: jsonb('instructions_en').$type<string[]>().default([]).notNull(),
		description: text('description'), // PT-BR
		videoUrl: text('video_url'), // URL pública no Supabase Storage
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('exercise_catalog_external_idx').on(t.externalId),
		index('exercise_catalog_body_part_idx').on(t.bodyPart),
		index('exercise_catalog_target_idx').on(t.targetMuscle),
		index('exercise_catalog_name_en_idx').on(t.nameEn)
	]
);
export type ExerciseCatalogItem = typeof exerciseCatalog.$inferSelect;

/* ────────── conversations + messages (chat com aluno) ────────── */
export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'cascade' }),
		studentId: uuid('student_id')
			.notNull()
			.references(() => students.id, { onDelete: 'cascade' }),
		lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
		unreadCount: integer('unread_count').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('conversations_pro_student_idx').on(t.professionalId, t.studentId),
		index('conversations_pro_idx').on(t.professionalId)
	]
);

export type MessageAttachment = { url: string; name: string };

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		fromRole: text('from_role').notNull(),
		body: text('body').notNull(),
		attachments: jsonb('attachments').$type<MessageAttachment[]>().default([]).notNull(),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [index('messages_conv_idx').on(t.conversationId, t.createdAt)]
);

/* ────────── appointments (agenda) ────────── */
export const appointments = pgTable(
	'appointments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		professionalId: uuid('professional_id')
			.notNull()
			.references(() => professionals.id, { onDelete: 'cascade' }),
		studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
		startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
		durationMinutes: integer('duration_minutes').default(60).notNull(),
		type: text('type').notNull(),
		label: text('label'),
		notes: text('notes'),
		status: text('status').default('scheduled').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('appointments_pro_starts_idx').on(t.professionalId, t.startsAt),
		index('appointments_student_idx').on(t.studentId)
	]
);

/* CRM — Leads (prospects pré-aluno) */

export const leadSourceEnum = pgEnum('lead_source', [
	'instagram',
	'indicacao',
	'anuncio',
	'site',
	'whatsapp',
	'outro'
]);

/**
 * Estágios do funil de aquisição do PreceptorFISIC (CRM admin).
 * Reflete a jornada do prospect → usuário → assinante.
 *
 * visitante: capturado em form da landing, ainda não criou conta
 * cadastrou: criou conta (auto via createProfessional hook)
 * ativou_aluno: cadastrou primeiro aluno (auto)
 * trial: em período de avaliação (subscriptionStatus='trial')
 * pagante: assinatura ativa (subscriptionStatus='active')
 * cancelado: cancelou assinatura (subscriptionStatus='cancelled')
 * perdido: prospect desistiu antes de virar pagante
 */
export const leadStageEnum = pgEnum('lead_stage', [
	'visitante',
	'cadastrou',
	'ativou_aluno',
	'trial',
	'pagante',
	'cancelado',
	'perdido'
]);

export const leads = pgTable(
	'leads',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		/**
		 * Admin "dono" do lead. Nullable porque leads auto-criados via
		 * signup não têm dono específico — qualquer admin os enxerga.
		 */
		professionalId: uuid('professional_id').references(() => professionals.id, {
			onDelete: 'set null'
		}),
		/**
		 * Quando o lead já é um usuário cadastrado do PreceptorFISIC,
		 * aponta pro record dele. NULL pra leads externos (landing/manual).
		 */
		subjectProfessionalId: uuid('subject_professional_id').references(() => professionals.id, {
			onDelete: 'cascade'
		}),
		name: text('name').notNull(),
		phone: text('phone'),
		email: text('email'),
		source: leadSourceEnum('source').default('outro').notNull(),
		stage: leadStageEnum('stage').default('visitante').notNull(),
		notes: text('notes'),
		nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
		/** Razão da perda (livre): "preço alto", "fechou com concorrente", etc */
		lostReason: text('lost_reason'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		index('leads_stage_idx').on(t.stage),
		index('leads_followup_idx').on(t.nextFollowUpAt),
		index('leads_created_idx').on(t.createdAt),
		index('leads_subject_pro_idx').on(t.subjectProfessionalId)
	]
);

/* ────────── feedback dos beta testers ────────── */

export const feedbackCategoryEnum = pgEnum('feedback_category', [
	'bug',
	'sugestao',
	'duvida',
	'elogio',
	'outro'
]);

export const feedback = pgTable(
	'feedback',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		// Autor (profissional/beta tester). set null se a conta for removida.
		professionalId: uuid('professional_id').references(() => professionals.id, {
			onDelete: 'set null'
		}),
		// Snapshot do nome/email — preserva a autoria mesmo se o professional sumir.
		authorName: text('author_name'),
		authorEmail: text('author_email'),
		category: feedbackCategoryEnum('category').default('outro').notNull(),
		message: text('message').notNull(),
		// Página/contexto opcional de onde o feedback foi enviado.
		page: text('page'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [index('feedback_created_idx').on(t.createdAt)]
);

/**
 * Inbox idempotente de webhooks do Asaas (billing).
 * Entrega é at-least-once: o mesmo event id pode chegar 2x — o UNIQUE em
 * asaas_event_id absorve a duplicata. Payload integral guardado pra
 * auditoria/reprocesso. processedAt null = pendente; error preenchido =
 * precisa de reconciliação manual (ex: pagador sem conta no app).
 */
export const asaasWebhookEvents = pgTable(
	'asaas_webhook_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		asaasEventId: text('asaas_event_id').notNull().unique(),
		event: text('event').notNull(),
		paymentId: text('payment_id'),
		payload: jsonb('payload').notNull(),
		professionalId: uuid('professional_id').references(() => professionals.id, {
			onDelete: 'set null'
		}),
		error: text('error'),
		receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true })
	},
	(t) => [index('asaas_events_received_idx').on(t.receivedAt)]
);

/* Inferred types */
export type ExerciseLibraryItem = typeof exerciseLibrary.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type Professional = typeof professionals.$inferSelect;
export type NewProfessional = typeof professionals.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type HealthProfile = typeof healthProfiles.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type TrainingSession = typeof trainingSessions.$inferSelect;
export type ProgressRecord = typeof progressRecords.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type AiRun = typeof aiRuns.$inferSelect;
export type ClinicalRule = typeof clinicalRules.$inferSelect;
