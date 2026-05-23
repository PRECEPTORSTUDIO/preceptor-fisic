/**
 * Queries Drizzle centralizadas — toda interação com DB passa por aqui.
 * Filtragem por professional_id é responsabilidade dos callers (RLS também garante).
 */
import { eq, and, desc, asc, isNull, sql, count, gte, lte, inArray } from 'drizzle-orm';
import { db } from './db';
import {
	professionals,
	students,
	healthProfiles,
	trainingPreferences,
	trainingPlans,
	trainingSessions,
	physicalAssessments,
	progressRecords,
	exerciseLibrary,
	exerciseCatalog,
	conversations,
	messages,
	appointments,
	type Professional,
	type Student,
	type HealthProfile,
	type TrainingPlan,
	type ExerciseLibraryItem,
	type Conversation,
	type Message,
	type Appointment
} from './db/schema';

/* ────────── PROFESSIONAL ────────── */

export async function getProfessionalByAuthId(authUserId: string): Promise<Professional | null> {
	const rows = await db
		.select()
		.from(professionals)
		.where(eq(professionals.authUserId, authUserId))
		.limit(1);
	return rows[0] ?? null;
}

/* ────────── STUDENTS ────────── */

export type StudentListItem = {
	id: string;
	name: string;
	birthDate: string | null;
	age: number | null;
	sex: string;
	weightKg: number | null;
	heightCm: number | null;
	goal: string | null;
	planTitle: string | null;
	planActive: boolean;
	adherence: number;
	sessions7: number;
	last: string | null;
	streak: number;
	status: 'active' | 'paused';
};

function calcAge(birth: string | null): number | null {
	if (!birth) return null;
	const b = new Date(birth);
	const now = new Date();
	let a = now.getFullYear() - b.getFullYear();
	const m = now.getMonth() - b.getMonth();
	if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
	return a;
}

const GOAL_LABELS: Record<string, string> = {
	emagrecimento: 'Emagrecimento',
	hipertrofia: 'Hipertrofia',
	forca: 'Força',
	condicionamento_cardiovascular: 'Cardio',
	qualidade_de_vida: 'Saúde geral',
	reabilitacao: 'Reabilitação',
	performance: 'Performance'
};

export async function getStudentsByProfessional(professionalId: string): Promise<StudentListItem[]> {
	// 1 query única — antes era 3N+1 round-trips (~1.5s pra 10 alunos no SP→SP).
	// Agora usa correlated subqueries em uma só ida ao Postgres (~80ms).
	const rows = await db.execute<{
		id: string;
		name: string;
		birth_date: string | null;
		sex: string;
		weight_kg: number | null;
		height_cm: number | null;
		goals: string[] | null;
		weekly_sessions: number | null;
		plan_summary: string | null;
		plan_status: string | null;
		sessions_7: number;
		last_session: Date | null;
		streak: number;
	}>(sql`
		SELECT
			s.id,
			s.name,
			s.birth_date,
			s.sex::text AS sex,
			s.weight_kg,
			s.height_cm,
			tp.goals,
			tp.weekly_sessions,
			(
				SELECT plan_summary FROM training_plans
				WHERE student_id = s.id
				ORDER BY created_at DESC LIMIT 1
			) AS plan_summary,
			(
				SELECT status::text FROM training_plans
				WHERE student_id = s.id
				ORDER BY created_at DESC LIMIT 1
			) AS plan_status,
			COALESCE((
				SELECT COUNT(*) FROM training_sessions
				WHERE student_id = s.id
				  AND session_date >= now() - interval '7 days'
			), 0)::int AS sessions_7,
			(
				SELECT MAX(session_date) FROM training_sessions
				WHERE student_id = s.id
			) AS last_session,
			-- streak: dias consecutivos contando de hoje pra trás onde teve ao menos 1 sessão.
			-- Usa generate_series + EXISTS pra encontrar o gap. Streak = 1º dia sem sessão (-1).
			COALESCE((
				WITH days AS (
					SELECT generate_series(0, 60)::int AS d
				),
				flags AS (
					SELECT
						d,
						EXISTS (
							SELECT 1 FROM training_sessions ts
							WHERE ts.student_id = s.id
							  AND ts.session_date::date = (CURRENT_DATE - d * INTERVAL '1 day')::date
						) AS has_session
					FROM days
				),
				first_gap AS (
					SELECT MIN(d) AS gap FROM flags WHERE has_session = false
				)
				SELECT COALESCE((SELECT gap FROM first_gap), 60)
			), 0)::int AS streak
		FROM students s
		LEFT JOIN training_preferences tp ON tp.student_id = s.id
		WHERE s.professional_id = ${professionalId}
		  AND s.deleted_at IS NULL
		ORDER BY s.name
	`);

	const list = (rows as unknown as { rows?: typeof rows }).rows ?? rows;

	return (list as Array<{
		id: string;
		name: string;
		birth_date: string | null;
		sex: string;
		weight_kg: number | null;
		height_cm: number | null;
		goals: string[] | null;
		weekly_sessions: number | null;
		plan_summary: string | null;
		plan_status: string | null;
		sessions_7: number;
		last_session: Date | string | null;
		streak: number;
	}>).map((r) => {
		const sessions7 = Number(r.sessions_7 ?? 0);
		const goal = r.goals?.[0];
		const goalLabel = goal ? (GOAL_LABELS[goal] ?? goal) : null;
		const status: 'active' | 'paused' =
			r.plan_status === 'published' || r.plan_status === 'generated' ? 'active' : 'paused';
		const lastDate = r.last_session ? new Date(r.last_session) : null;
		const lastFmt = lastDate
			? lastDate
					.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
					.replace('.', '')
			: null;
		const adherence = r.weekly_sessions
			? Math.min(100, Math.round((sessions7 / r.weekly_sessions) * 100))
			: 0;

		return {
			id: r.id,
			name: r.name,
			birthDate: r.birth_date,
			age: calcAge(r.birth_date),
			sex: r.sex,
			weightKg: r.weight_kg,
			heightCm: r.height_cm,
			goal: goalLabel,
			planTitle: r.plan_summary?.slice(0, 60) ?? null,
			planActive: status === 'active',
			adherence,
			sessions7,
			last: lastFmt,
			streak: Number(r.streak ?? 0),
			status
		};
	});
}

export type ProgressMetric = {
	values: number[];
	current: number | null;
	first: number | null;
	deltaPct: number | null;
};

export type StudentDetail = {
	student: Student;
	healthProfile: HealthProfile | null;
	preferences: typeof trainingPreferences.$inferSelect | null;
	plans: { id: string; title: string; isActive: boolean; createdAt: Date; sessionsTotal: number }[];
	assessments: typeof physicalAssessments.$inferSelect[];
	lastWeights: number[];
	/** Séries de progresso pra sparklines — últimas 8 medidas, ordem cronológica */
	progress: {
		weight: ProgressMetric;
		bmi: ProgressMetric;
		bodyFat: ProgressMetric;
		restingHr: ProgressMetric;
		bpSystolic: ProgressMetric;
	};
};

function buildMetric(values: number[]): ProgressMetric {
	if (values.length === 0) return { values: [], current: null, first: null, deltaPct: null };
	const current = values[values.length - 1] ?? null;
	const first = values[0] ?? null;
	const deltaPct =
		current !== null && first !== null && first !== 0
			? ((current - first) / first) * 100
			: null;
	return { values, current, first, deltaPct };
}

export async function getStudentDetail(
	studentId: string,
	professionalId: string
): Promise<StudentDetail | null> {
	const studentRows = await db
		.select()
		.from(students)
		.where(and(eq(students.id, studentId), eq(students.professionalId, professionalId), isNull(students.deletedAt)))
		.limit(1);
	const student = studentRows[0];
	if (!student) return null;

	const [hp] = await db
		.select()
		.from(healthProfiles)
		.where(eq(healthProfiles.studentId, studentId))
		.limit(1);

	const [prefs] = await db
		.select()
		.from(trainingPreferences)
		.where(eq(trainingPreferences.studentId, studentId))
		.limit(1);

	const planRows = await db
		.select()
		.from(trainingPlans)
		.where(eq(trainingPlans.studentId, studentId))
		.orderBy(desc(trainingPlans.createdAt));

	const plans = planRows.map((p) => {
		const data = p.planData as { weekly_sessions?: unknown[] } | null;
		return {
			id: p.id,
			title: p.planSummary?.slice(0, 80) ?? 'Plano sem título',
			isActive: p.status === 'published' || p.status === 'generated',
			createdAt: p.createdAt,
			sessionsTotal: Array.isArray(data?.weekly_sessions) ? data.weekly_sessions.length : 0
		};
	});

	const assessments = await db
		.select()
		.from(physicalAssessments)
		.where(eq(physicalAssessments.studentId, studentId))
		.orderBy(desc(physicalAssessments.assessedAt))
		.limit(10);

	// Séries de progresso pras sparklines — extrai cada métrica das
	// últimas 8 avaliações em ordem cronológica (mais antiga → mais nova)
	const recent8 = assessments.slice(0, 8).slice().reverse();
	const seriesBmi = recent8.map((a) => a.bmi).filter((v): v is number => v !== null);
	const seriesBodyFat = recent8
		.map((a) => a.bodyFatPct)
		.filter((v): v is number => v !== null);
	const seriesRestingHr = recent8
		.map((a) => a.restingHr)
		.filter((v): v is number => v !== null);
	const seriesBpSys = recent8
		.map((a) => a.bloodPressureSystolic)
		.filter((v): v is number => v !== null);

	// Peso vem de progress_records (é registrado a cada avaliação automaticamente)
	const weightRows = await db
		.select({ value: progressRecords.value })
		.from(progressRecords)
		.where(and(eq(progressRecords.studentId, studentId), eq(progressRecords.metricType, 'weight')))
		.orderBy(desc(progressRecords.recordedAt))
		.limit(8);
	const lastWeights = weightRows.length
		? weightRows.map((r) => r.value).reverse()
		: student.weightKg
			? Array(8).fill(student.weightKg)
			: [];

	return {
		student,
		healthProfile: hp ?? null,
		preferences: prefs ?? null,
		plans,
		assessments,
		lastWeights,
		progress: {
			weight: buildMetric(lastWeights),
			bmi: buildMetric(seriesBmi),
			bodyFat: buildMetric(seriesBodyFat),
			restingHr: buildMetric(seriesRestingHr),
			bpSystolic: buildMetric(seriesBpSys)
		}
	};
}

/* ────────── PLANS ────────── */

export type PlanListItem = {
	id: string;
	title: string;
	description: string | null;
	studentName: string;
	studentId: string;
	status: string;
	isActive: boolean;
	createdAt: Date;
	publishedAt: Date | null;
	sessionsTotal: number;
};

export async function getPlansByProfessional(professionalId: string): Promise<PlanListItem[]> {
	const rows = await db
		.select({
			id: trainingPlans.id,
			summary: trainingPlans.planSummary,
			status: trainingPlans.status,
			createdAt: trainingPlans.createdAt,
			publishedAt: trainingPlans.publishedAt,
			planData: trainingPlans.planData,
			studentId: trainingPlans.studentId,
			studentName: students.name
		})
		.from(trainingPlans)
		.leftJoin(students, eq(students.id, trainingPlans.studentId))
		.where(eq(trainingPlans.professionalId, professionalId))
		.orderBy(desc(trainingPlans.createdAt));

	return rows.map((r) => {
		const data = r.planData as { weekly_sessions?: unknown[]; summary?: string } | null;
		const fullSummary = data?.summary ?? r.summary ?? '';
		return {
			id: r.id,
			title: fullSummary.slice(0, 80) || 'Plano',
			description: fullSummary,
			studentName: r.studentName ?? '—',
			studentId: r.studentId,
			status: r.status,
			isActive: r.status === 'published' || r.status === 'generated',
			createdAt: r.createdAt,
			publishedAt: r.publishedAt,
			sessionsTotal: Array.isArray(data?.weekly_sessions) ? data.weekly_sessions.length : 0
		};
	});
}

/* ────────── PLAN DETAIL ────────── */

export type PlanRestriction = {
	level: 'red' | 'yellow' | 'green';
	title: string;
	description: string;
	affected_exercises: string[];
	source?: { type: string; rule_code?: string; chunk_id?: string; source_id?: string; note?: string };
};

export type PlanExercise = {
	name: string;
	/** external_id do exercise_catalog quando o exercício vem do catálogo. */
	catalog_id?: string;
	reps?: string;
	sets?: number;
	rest_seconds?: number;
	load_guidance?: string;
	muscle_groups?: string[];
	execution_notes?: string;
	contraindications?: string[];
	source_refs?: {
		type: string;
		note?: string;
		chunk_id?: string;
		source_id?: string;
		page_number?: number;
	}[];
};

/**
 * Mapa external_id → metadata do catálogo (videoUrl, instruções PT, etc).
 * Usado pra renderizar vídeo demonstrativo na ficha do aluno.
 */
export type CatalogEntry = {
	externalId: string;
	name: string;
	nameEn: string;
	videoUrl: string | null;
	instructions: string[];
	bodyPart: string;
	targetMuscle: string;
	equipment: string | null;
	difficulty: string | null;
};
export type CatalogMap = Record<string, CatalogEntry>;

/**
 * Mapa de chunk_id → metadata da fonte (título, org, ano, página).
 * Usado pra renderizar citações reais no UI ao invés de "FONTE RAG" genérico.
 */
export type SourceCitation = {
	chunkId: string;
	sourceId: string;
	title: string;
	organization: string;
	year: number | null;
	pageNumber: number | null;
	excerpt: string;
};
export type SourceMap = Record<string, SourceCitation>;

export type PlanSessionData = {
	label?: string;
	focus?: string;
	duration_minutes?: number;
	warmup?: PlanExercise[];
	main?: PlanExercise[];
	cooldown?: PlanExercise[];
};

export type PlanData = {
	summary?: string;
	restrictions?: PlanRestriction[];
	weekly_sessions?: PlanSessionData[];
	assessment_protocols?: unknown[];
	progression_strategy?: unknown[];
	monitoring_parameters?: unknown[];
};

export type PlanDetail = {
	id: string;
	studentName: string;
	studentId: string;
	status: string;
	isActive: boolean;
	createdAt: Date;
	publishedAt: Date | null;
	planData: PlanData;
	sourceMap: SourceMap;
	/** external_id → catálogo (vídeo + instruções) pros exercícios do plano. */
	catalogMap: CatalogMap;
};

/**
 * Coleta todos os chunk_id e source_id citados em planData e enriquece com
 * metadata da fonte (título, org, ano, página, trecho). Single query — sem N+1.
 */
async function collectAndEnrichSources(planData: PlanData): Promise<SourceMap> {
	const chunkIds = new Set<string>();
	const sourceIds = new Set<string>();

	const collectFromRef = (ref: unknown) => {
		if (!ref || typeof ref !== 'object') return;
		const r = ref as { chunk_id?: string; source_id?: string };
		if (r.chunk_id) chunkIds.add(r.chunk_id);
		if (r.source_id) sourceIds.add(r.source_id);
	};

	for (const r of planData.restrictions ?? []) collectFromRef(r.source);
	for (const m of (planData.monitoring_parameters as Array<{ source_refs?: unknown[] }>) ?? []) {
		for (const ref of m.source_refs ?? []) collectFromRef(ref);
	}
	for (const a of (planData.assessment_protocols as Array<{ source_refs?: unknown[] }>) ?? []) {
		for (const ref of a.source_refs ?? []) collectFromRef(ref);
	}
	for (const s of planData.weekly_sessions ?? []) {
		for (const block of [s.warmup ?? [], s.main ?? [], s.cooldown ?? []]) {
			for (const ex of block) {
				for (const ref of ex.source_refs ?? []) collectFromRef(ref);
			}
		}
	}

	if (chunkIds.size === 0 && sourceIds.size === 0) return {};

	// Array vazio em ANY(${[]}::text[]) gera SQL inválido "ANY(()::text[])".
	// Sentinela '__none__' (não é UUID válido) garante array não-vazio
	// sem nunca casar com nenhuma linha real.
	const chunkArr = chunkIds.size > 0 ? Array.from(chunkIds) : ['__none__'];
	const sourceArr = sourceIds.size > 0 ? Array.from(sourceIds) : ['__none__'];

	// Single query — busca chunks + sources em uma só ida
	const rows = (await db.execute<{
		chunk_id: string | null;
		source_id: string;
		title: string;
		organization: string;
		year: number | null;
		page_number: number | null;
		excerpt: string;
	}>(sql`
		SELECT
			kc.id::text AS chunk_id,
			ks.id::text AS source_id,
			ks.title,
			ks.organization::text AS organization,
			ks.year,
			kc.page_number,
			LEFT(kc.content, 280) AS excerpt
		FROM knowledge_chunks kc
		JOIN knowledge_sources ks ON ks.id = kc.source_id
		WHERE kc.id::text = ANY(${chunkArr}::text[])
		   OR ks.id::text = ANY(${sourceArr}::text[])
	`)) as unknown as Array<{
		chunk_id: string | null;
		source_id: string;
		title: string;
		organization: string;
		year: number | null;
		page_number: number | null;
		excerpt: string;
	}>;

	const list = (rows as unknown as { rows?: typeof rows }).rows ?? rows;
	const map: SourceMap = {};
	for (const r of list as Array<{
		chunk_id: string | null;
		source_id: string;
		title: string;
		organization: string;
		year: number | null;
		page_number: number | null;
		excerpt: string;
	}>) {
		// Indexa por chunk_id (quando vem do join completo) e também por source_id
		if (r.chunk_id) {
			map[r.chunk_id] = {
				chunkId: r.chunk_id,
				sourceId: r.source_id,
				title: r.title,
				organization: r.organization,
				year: r.year,
				pageNumber: r.page_number,
				excerpt: r.excerpt
			};
		}
		// Source-level fallback (quando AI cita só source_id)
		map[r.source_id] = {
			chunkId: r.chunk_id ?? r.source_id,
			sourceId: r.source_id,
			title: r.title,
			organization: r.organization,
			year: r.year,
			pageNumber: r.page_number,
			excerpt: r.excerpt
		};
	}
	return map;
}

/**
 * Coleta todos os catalog_ids referenciados nos exercícios do plano e
 * carrega as linhas do exercise_catalog. O resultado vira um map
 * external_id → { videoUrl, instruções PT, etc } usado pelo UI pra
 * mostrar vídeo demonstrativo.
 */
async function collectAndEnrichCatalog(planData: PlanData): Promise<CatalogMap> {
	const ids = new Set<string>();
	for (const session of planData.weekly_sessions ?? []) {
		for (const block of [session.warmup ?? [], session.main ?? [], session.cooldown ?? []]) {
			for (const ex of block) {
				if (ex.catalog_id && /^\d{4,5}$/.test(ex.catalog_id)) ids.add(ex.catalog_id);
			}
		}
	}
	if (ids.size === 0) return {};
	const rows = await db
		.select({
			externalId: exerciseCatalog.externalId,
			name: exerciseCatalog.name,
			nameEn: exerciseCatalog.nameEn,
			videoUrl: exerciseCatalog.videoUrl,
			instructions: exerciseCatalog.instructions,
			bodyPart: exerciseCatalog.bodyPart,
			targetMuscle: exerciseCatalog.targetMuscle,
			equipment: exerciseCatalog.equipment,
			difficulty: exerciseCatalog.difficulty
		})
		.from(exerciseCatalog)
		.where(inArray(exerciseCatalog.externalId, [...ids]));
	const map: CatalogMap = {};
	for (const r of rows) {
		map[r.externalId] = {
			externalId: r.externalId,
			name: r.name,
			nameEn: r.nameEn,
			videoUrl: r.videoUrl,
			instructions: r.instructions ?? [],
			bodyPart: r.bodyPart,
			targetMuscle: r.targetMuscle,
			equipment: r.equipment,
			difficulty: r.difficulty
		};
	}
	return map;
}

export async function getPlanDetail(
	planId: string,
	professionalId: string
): Promise<PlanDetail | null> {
	const rows = await db
		.select({
			id: trainingPlans.id,
			status: trainingPlans.status,
			createdAt: trainingPlans.createdAt,
			publishedAt: trainingPlans.publishedAt,
			planData: trainingPlans.planData,
			studentId: trainingPlans.studentId,
			studentName: students.name
		})
		.from(trainingPlans)
		.leftJoin(students, eq(students.id, trainingPlans.studentId))
		.where(and(eq(trainingPlans.id, planId), eq(trainingPlans.professionalId, professionalId)))
		.limit(1);
	const r = rows[0];
	if (!r) return null;
	const planData = (r.planData as PlanData) ?? {};
	const [sourceMap, catalogMap] = await Promise.all([
		collectAndEnrichSources(planData),
		collectAndEnrichCatalog(planData)
	]);
	return {
		id: r.id,
		studentName: r.studentName ?? '—',
		studentId: r.studentId,
		status: r.status,
		isActive: r.status === 'published' || r.status === 'generated',
		createdAt: r.createdAt,
		publishedAt: r.publishedAt,
		planData,
		sourceMap,
		catalogMap
	};
}

/* ────────── MUTATIONS ────────── */

export type CreateStudentInput = {
	professionalId: string;
	name: string;
	birthDate?: string | null;
	sex: 'feminino' | 'masculino' | 'outro' | 'nao_informado';
	weightKg?: number | null;
	heightCm?: number | null;
	phone?: string | null;
	email?: string | null;
	consentAcceptedAt: Date;
	diagnoses: { label: string; severity?: 'leve' | 'moderada' | 'grave' }[];
	medications: { name: string; dose?: string; frequency?: string }[];
	cardiovascularRisk: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	experienceLevel: 'iniciante' | 'intermediario' | 'avancado';
	weeklySessions: number;
	minutesPerSession: number;
	goals: string[];
	equipmentAvailable: string[];
};

export async function createStudentTx(input: CreateStudentInput): Promise<string> {
	return await db.transaction(async (tx) => {
		const [s] = await tx
			.insert(students)
			.values({
				professionalId: input.professionalId,
				name: input.name,
				birthDate: input.birthDate ?? undefined,
				sex: input.sex,
				weightKg: input.weightKg ?? undefined,
				heightCm: input.heightCm ?? undefined,
				phone: input.phone ?? undefined,
				email: input.email ?? undefined,
				consentAcceptedAt: input.consentAcceptedAt,
				consentTermsVersion: 'v1.0'
			})
			.returning({ id: students.id });
		if (!s) throw new Error('falha ao criar aluno');

		await tx.insert(healthProfiles).values({
			studentId: s.id,
			diagnoses: input.diagnoses,
			medications: input.medications,
			cardiovascularRisk: input.cardiovascularRisk
		});

		await tx.insert(trainingPreferences).values({
			studentId: s.id,
			experienceLevel: input.experienceLevel,
			weeklySessions: input.weeklySessions,
			minutesPerSession: input.minutesPerSession,
			goals: input.goals,
			equipmentAvailable: input.equipmentAvailable,
			preferredModalities: ['musculacao']
		});

		return s.id;
	});
}

export type CreateAppointmentInput = {
	professionalId: string;
	studentId: string | null;
	startsAt: Date;
	durationMinutes: number;
	type: 'treino' | 'avaliacao' | 'reabilitacao' | 'consulta';
	label?: string;
	notes?: string;
};

export async function createAppointment(input: CreateAppointmentInput): Promise<string> {
	const [a] = await db
		.insert(appointments)
		.values({
			professionalId: input.professionalId,
			studentId: input.studentId,
			startsAt: input.startsAt,
			durationMinutes: input.durationMinutes,
			type: input.type,
			label: input.label,
			notes: input.notes,
			status: 'scheduled'
		})
		.returning({ id: appointments.id });
	if (!a) throw new Error('falha ao criar appointment');
	return a.id;
}

export type CreateAssessmentInput = {
	professionalId: string;
	studentId: string;
	bodyFatPct?: number;
	leanMassKg?: number;
	bmi?: number;
	restingHr?: number;
	bloodPressureSystolic?: number;
	bloodPressureDiastolic?: number;
	notes?: string;
	weightKg?: number;
};

export async function createAssessment(input: CreateAssessmentInput): Promise<string> {
	return await db.transaction(async (tx) => {
		const [a] = await tx
			.insert(physicalAssessments)
			.values({
				studentId: input.studentId,
				createdBy: input.professionalId,
				bodyFatPct: input.bodyFatPct,
				leanMassKg: input.leanMassKg,
				bmi: input.bmi,
				restingHr: input.restingHr,
				bloodPressureSystolic: input.bloodPressureSystolic,
				bloodPressureDiastolic: input.bloodPressureDiastolic,
				notes: input.notes
			})
			.returning({ id: physicalAssessments.id });
		if (!a) throw new Error('falha ao criar avaliação');

		const recs: Array<{ metricType: string; value: number; unit: string }> = [];
		if (input.weightKg) recs.push({ metricType: 'weight', value: input.weightKg, unit: 'kg' });
		if (input.bodyFatPct) recs.push({ metricType: 'body_fat_pct', value: input.bodyFatPct, unit: '%' });
		if (input.bmi) recs.push({ metricType: 'bmi', value: input.bmi, unit: 'kg/m2' });
		if (input.leanMassKg) recs.push({ metricType: 'lean_mass', value: input.leanMassKg, unit: 'kg' });

		if (recs.length > 0) {
			await tx.insert(progressRecords).values(
				recs.map((r) => ({
					studentId: input.studentId,
					assessmentId: a.id,
					metricType: r.metricType,
					value: r.value,
					unit: r.unit
				}))
			);
		}

		if (input.weightKg) {
			await tx
				.update(students)
				.set({ weightKg: input.weightKg, updatedAt: new Date() })
				.where(eq(students.id, input.studentId));
		}

		return a.id;
	});
}

export type UpdateStudentInput = {
	studentId: string;
	professionalId: string;
	name: string;
	birthDate?: string | null;
	sex: 'feminino' | 'masculino' | 'outro' | 'nao_informado';
	weightKg?: number | null;
	heightCm?: number | null;
	phone?: string | null;
	email?: string | null;
	diagnoses: { label: string; severity?: 'leve' | 'moderada' | 'grave' }[];
	medications: { name: string; dose?: string; frequency?: string }[];
	cardiovascularRisk: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	experienceLevel: 'iniciante' | 'intermediario' | 'avancado';
	weeklySessions: number;
	minutesPerSession: number;
	goals: string[];
	equipmentAvailable: string[];
};

export async function updateStudentTx(input: UpdateStudentInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [s] = await tx
			.select({ id: students.id })
			.from(students)
			.where(and(eq(students.id, input.studentId), eq(students.professionalId, input.professionalId)))
			.limit(1);
		if (!s) throw new Error('aluno não encontrado ou não pertence a este profissional');

		await tx
			.update(students)
			.set({
				name: input.name,
				birthDate: input.birthDate ?? null,
				sex: input.sex,
				weightKg: input.weightKg ?? null,
				heightCm: input.heightCm ?? null,
				phone: input.phone ?? null,
				email: input.email ?? null,
				updatedAt: new Date()
			})
			.where(eq(students.id, input.studentId));

		const [hp] = await tx
			.select({ id: healthProfiles.id })
			.from(healthProfiles)
			.where(eq(healthProfiles.studentId, input.studentId))
			.limit(1);
		if (hp) {
			await tx
				.update(healthProfiles)
				.set({
					diagnoses: input.diagnoses,
					medications: input.medications,
					cardiovascularRisk: input.cardiovascularRisk,
					updatedAt: new Date()
				})
				.where(eq(healthProfiles.id, hp.id));
		} else {
			await tx.insert(healthProfiles).values({
				studentId: input.studentId,
				diagnoses: input.diagnoses,
				medications: input.medications,
				cardiovascularRisk: input.cardiovascularRisk
			});
		}

		const [pref] = await tx
			.select({ id: trainingPreferences.id })
			.from(trainingPreferences)
			.where(eq(trainingPreferences.studentId, input.studentId))
			.limit(1);
		if (pref) {
			await tx
				.update(trainingPreferences)
				.set({
					experienceLevel: input.experienceLevel,
					weeklySessions: input.weeklySessions,
					minutesPerSession: input.minutesPerSession,
					goals: input.goals,
					equipmentAvailable: input.equipmentAvailable,
					updatedAt: new Date()
				})
				.where(eq(trainingPreferences.id, pref.id));
		} else {
			await tx.insert(trainingPreferences).values({
				studentId: input.studentId,
				experienceLevel: input.experienceLevel,
				weeklySessions: input.weeklySessions,
				minutesPerSession: input.minutesPerSession,
				goals: input.goals,
				equipmentAvailable: input.equipmentAvailable,
				preferredModalities: ['musculacao']
			});
		}
	});
}

export async function softDeleteStudent(studentId: string, professionalId: string): Promise<void> {
	await db
		.update(students)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(students.id, studentId), eq(students.professionalId, professionalId)));
}

/* ────────── PLAN STATUS ────────── */

export type PublishResult = { ok: boolean; reason?: string };

export async function publishPlan(planId: string, professionalId: string): Promise<PublishResult> {
	const [plan] = await db
		.select({
			id: trainingPlans.id,
			status: trainingPlans.status,
			restrictions: trainingPlans.restrictions,
			professionalId: trainingPlans.professionalId
		})
		.from(trainingPlans)
		.where(eq(trainingPlans.id, planId))
		.limit(1);

	if (!plan) return { ok: false, reason: 'plano não encontrado' };
	if (plan.professionalId !== professionalId) return { ok: false, reason: 'plano não pertence a este profissional' };
	if (plan.status !== 'generated') return { ok: false, reason: `plano em status "${plan.status}" — só "generated" pode ser publicado` };

	const reds = (plan.restrictions ?? []).filter((r) => r.level === 'red' && !r.resolved_at);
	if (reds.length > 0) {
		return {
			ok: false,
			reason: `plano tem ${reds.length} restrição${reds.length > 1 ? 'ões' : ''} CRÍTICA${reds.length > 1 ? 'S' : ''} não-resolvida${reds.length > 1 ? 's' : ''} — substitua exercícios ou marque como overridden antes de publicar`
		};
	}

	await db
		.update(trainingPlans)
		.set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
		.where(eq(trainingPlans.id, planId));
	return { ok: true };
}

export async function archivePlan(planId: string, professionalId: string): Promise<void> {
	await db
		.update(trainingPlans)
		.set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(trainingPlans.id, planId), eq(trainingPlans.professionalId, professionalId)));
}

/* ────────── PROFESSIONAL UPDATE ────────── */

export type UpdateProfessionalInput = {
	authUserId: string;
	name: string;
	cref?: string | null;
	specialty?:
		| 'prescricao_clinica'
		| 'treinamento_funcional'
		| 'reabilitacao'
		| 'musculacao'
		| 'personal'
		| 'pilates'
		| 'outro';
	avatarUrl?: string | null;
};

export type CreateProfessionalInput = {
	authUserId: string;
	email: string;
	name: string;
	cref?: string | null;
	specialty?:
		| 'prescricao_clinica'
		| 'treinamento_funcional'
		| 'reabilitacao'
		| 'musculacao'
		| 'personal'
		| 'pilates'
		| 'outro';
};

export async function createProfessional(input: CreateProfessionalInput): Promise<string> {
	const [row] = await db
		.insert(professionals)
		.values({
			authUserId: input.authUserId,
			email: input.email,
			name: input.name,
			cref: input.cref ?? null,
			specialty: input.specialty ?? 'prescricao_clinica',
			onboardingCompleted: true
		})
		.returning({ id: professionals.id });
	if (!row) throw new Error('falha ao criar professional');
	return row.id;
}

export async function updateProfessional(input: UpdateProfessionalInput): Promise<void> {
	await db
		.update(professionals)
		.set({
			name: input.name,
			cref: input.cref ?? null,
			specialty: input.specialty,
			avatarUrl: input.avatarUrl ?? null,
			updatedAt: new Date()
		})
		.where(eq(professionals.authUserId, input.authUserId));
}

export type CreateExerciseInput = {
	professionalId: string;
	code?: string;
	name: string;
	muscleGroup: string;
	equipment?: string;
	level?: string;
	pattern?: string;
	executionNotes?: string;
	contraindications: string[];
};

export type UpdateAppointmentInput = {
	appointmentId: string;
	professionalId: string;
	studentId: string | null;
	startsAt: Date;
	durationMinutes: number;
	type: 'treino' | 'avaliacao' | 'reabilitacao' | 'consulta';
	label?: string;
	notes?: string;
	status: 'scheduled' | 'completed' | 'cancelled';
};

export async function getAppointmentById(
	appointmentId: string,
	professionalId: string
): Promise<AppointmentRow | null> {
	const [r] = await db
		.select({
			id: appointments.id,
			professionalId: appointments.professionalId,
			studentId: appointments.studentId,
			startsAt: appointments.startsAt,
			durationMinutes: appointments.durationMinutes,
			type: appointments.type,
			label: appointments.label,
			notes: appointments.notes,
			status: appointments.status,
			createdAt: appointments.createdAt,
			updatedAt: appointments.updatedAt,
			studentName: students.name
		})
		.from(appointments)
		.leftJoin(students, eq(students.id, appointments.studentId))
		.where(and(eq(appointments.id, appointmentId), eq(appointments.professionalId, professionalId)))
		.limit(1);
	return r ?? null;
}

export async function updateAppointment(input: UpdateAppointmentInput): Promise<void> {
	await db
		.update(appointments)
		.set({
			studentId: input.studentId,
			startsAt: input.startsAt,
			durationMinutes: input.durationMinutes,
			type: input.type,
			label: input.label,
			notes: input.notes,
			status: input.status,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(appointments.id, input.appointmentId),
				eq(appointments.professionalId, input.professionalId)
			)
		);
}

export async function deleteAppointment(appointmentId: string, professionalId: string): Promise<void> {
	await db
		.delete(appointments)
		.where(and(eq(appointments.id, appointmentId), eq(appointments.professionalId, professionalId)));
}

export type UpdateExerciseInput = CreateExerciseInput & { exerciseId: string };

export async function getExerciseById(
	exerciseId: string,
	professionalId: string
): Promise<ExerciseLibraryItem | null> {
	const [r] = await db
		.select()
		.from(exerciseLibrary)
		.where(
			and(eq(exerciseLibrary.id, exerciseId), eq(exerciseLibrary.professionalId, professionalId))
		)
		.limit(1);
	return r ?? null;
}

export async function updateExercise(input: UpdateExerciseInput): Promise<void> {
	await db
		.update(exerciseLibrary)
		.set({
			code: input.code,
			name: input.name,
			muscleGroup: input.muscleGroup,
			equipment: input.equipment,
			level: input.level,
			pattern: input.pattern,
			executionNotes: input.executionNotes,
			contraindications: input.contraindications,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(exerciseLibrary.id, input.exerciseId),
				eq(exerciseLibrary.professionalId, input.professionalId)
			)
		);
}

export async function deleteExercise(exerciseId: string, professionalId: string): Promise<void> {
	await db
		.delete(exerciseLibrary)
		.where(
			and(eq(exerciseLibrary.id, exerciseId), eq(exerciseLibrary.professionalId, professionalId))
		);
}

export async function createExercise(input: CreateExerciseInput): Promise<string> {
	const [e] = await db
		.insert(exerciseLibrary)
		.values({
			professionalId: input.professionalId,
			code: input.code,
			name: input.name,
			muscleGroup: input.muscleGroup,
			equipment: input.equipment,
			level: input.level,
			pattern: input.pattern,
			executionNotes: input.executionNotes,
			contraindications: input.contraindications
		})
		.returning({ id: exerciseLibrary.id });
	if (!e) throw new Error('falha ao criar exercício');
	return e.id;
}

/* ────────── EXERCISES LIBRARY ────────── */

export async function getExerciseLibrary(professionalId: string): Promise<ExerciseLibraryItem[]> {
	return db
		.select()
		.from(exerciseLibrary)
		.where(eq(exerciseLibrary.professionalId, professionalId))
		.orderBy(asc(exerciseLibrary.muscleGroup), asc(exerciseLibrary.name));
}

/* ────────── CONVERSATIONS + MESSAGES ────────── */

export type ThreadListItem = {
	id: string;
	studentId: string;
	studentName: string;
	last: string | null;
	lastAt: Date | null;
	unread: number;
	online: boolean;
};

export async function getConversationThreads(professionalId: string): Promise<ThreadListItem[]> {
	const rows = await db
		.select({
			id: conversations.id,
			studentId: conversations.studentId,
			studentName: students.name,
			lastAt: conversations.lastMessageAt,
			unread: conversations.unreadCount
		})
		.from(conversations)
		.leftJoin(students, eq(students.id, conversations.studentId))
		.where(eq(conversations.professionalId, professionalId))
		.orderBy(desc(conversations.lastMessageAt));

	const result: ThreadListItem[] = [];
	for (const r of rows) {
		const [lastMsg] = await db
			.select({ body: messages.body })
			.from(messages)
			.where(eq(messages.conversationId, r.id))
			.orderBy(desc(messages.createdAt))
			.limit(1);
		result.push({
			id: r.id,
			studentId: r.studentId,
			studentName: r.studentName ?? '—',
			last: lastMsg?.body.slice(0, 80) ?? null,
			lastAt: r.lastAt,
			unread: r.unread,
			online: Math.random() > 0.5 // mock
		});
	}
	return result;
}

export async function getMessagesForThread(conversationId: string): Promise<Message[]> {
	return db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(asc(messages.createdAt));
}

export async function postMessage(
	conversationId: string,
	body: string,
	fromRole: 'professional' | 'student'
): Promise<Message> {
	const [m] = await db
		.insert(messages)
		.values({ conversationId, body, fromRole })
		.returning();
	if (!m) throw new Error('Falha ao inserir mensagem');
	await db
		.update(conversations)
		.set({ lastMessageAt: new Date() })
		.where(eq(conversations.id, conversationId));
	return m;
}

/* ────────── APPOINTMENTS ────────── */

export type AppointmentRow = Appointment & { studentName: string | null };

export async function getAppointmentsInRange(
	professionalId: string,
	start: Date,
	end: Date
): Promise<AppointmentRow[]> {
	const rows = await db
		.select({
			id: appointments.id,
			professionalId: appointments.professionalId,
			studentId: appointments.studentId,
			startsAt: appointments.startsAt,
			durationMinutes: appointments.durationMinutes,
			type: appointments.type,
			label: appointments.label,
			notes: appointments.notes,
			status: appointments.status,
			createdAt: appointments.createdAt,
			updatedAt: appointments.updatedAt,
			studentName: students.name
		})
		.from(appointments)
		.leftJoin(students, eq(students.id, appointments.studentId))
		.where(
			and(
				eq(appointments.professionalId, professionalId),
				gte(appointments.startsAt, start),
				lte(appointments.startsAt, end)
			)
		)
		.orderBy(asc(appointments.startsAt));
	return rows;
}

/* ────────── ALUNO APP (público, sem auth do prof) ────────── */

export type AlunoAppData = {
	student: { id: string; name: string; weightKg: number | null; heightCm: number | null };
	professional: { id: string; name: string; cref: string | null };
	plan: PlanDetail | null;
	recentSessions: {
		id: string;
		sessionDate: Date;
		sessionLabel: string | null;
		perceivedEffort: number | null;
	}[];
	streakDays: number;
};

export async function getAlunoAppData(studentId: string): Promise<AlunoAppData | null> {
	const [s] = await db
		.select()
		.from(students)
		.where(and(eq(students.id, studentId), isNull(students.deletedAt)))
		.limit(1);
	if (!s) return null;

	const [pro] = await db
		.select()
		.from(professionals)
		.where(eq(professionals.id, s.professionalId))
		.limit(1);
	if (!pro) return null;

	const [planRow] = await db
		.select()
		.from(trainingPlans)
		.where(
			and(eq(trainingPlans.studentId, studentId), sql`status IN ('published', 'generated')`)
		)
		.orderBy(desc(trainingPlans.publishedAt), desc(trainingPlans.createdAt))
		.limit(1);

	const plan: PlanDetail | null = planRow
		? {
				id: planRow.id,
				studentName: s.name,
				studentId: s.id,
				status: planRow.status,
				isActive: planRow.status === 'published' || planRow.status === 'generated',
				createdAt: planRow.createdAt,
				publishedAt: planRow.publishedAt,
				planData: (planRow.planData as PlanData) ?? {}
			}
		: null;

	const sessRows = await db
		.select({
			id: trainingSessions.id,
			sessionDate: trainingSessions.sessionDate,
			sessionLabel: trainingSessions.sessionLabel,
			perceivedEffort: trainingSessions.perceivedEffort
		})
		.from(trainingSessions)
		.where(eq(trainingSessions.studentId, studentId))
		.orderBy(desc(trainingSessions.sessionDate))
		.limit(10);

	const streakDays = computeStreak(sessRows.map((r) => r.sessionDate));

	return {
		student: { id: s.id, name: s.name, weightKg: s.weightKg, heightCm: s.heightCm },
		professional: { id: pro.id, name: pro.name, cref: pro.cref },
		plan,
		recentSessions: sessRows,
		streakDays
	};
}

function computeStreak(dates: Date[]): number {
	if (dates.length === 0) return 0;
	const days = new Set(
		dates.map((d) => {
			const dt = new Date(d);
			return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
		})
	);
	let streak = 0;
	const now = new Date();
	for (let i = 0; i < 365; i++) {
		const d = new Date(now);
		d.setDate(now.getDate() - i);
		const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
		if (days.has(key)) {
			streak++;
		} else if (i > 0) {
			break;
		}
	}
	return streak;
}

export type LogSessionInput = {
	studentId: string;
	planId: string;
	professionalId: string;
	sessionLabel: string;
	exerciseLogs: {
		exercise_id: string;
		name?: string;
		sets_done: number;
		reps_done: string;
		load_used?: string;
		notes?: string;
		completed: boolean;
	}[];
	perceivedEffort?: number;
	observations?: string;
};

export async function logTrainingSession(input: LogSessionInput): Promise<string> {
	const [row] = await db
		.insert(trainingSessions)
		.values({
			planId: input.planId,
			studentId: input.studentId,
			loggedBy: input.professionalId,
			sessionLabel: input.sessionLabel,
			exercisesDone: input.exerciseLogs,
			perceivedEffort: input.perceivedEffort,
			observations: input.observations
		})
		.returning({ id: trainingSessions.id });
	if (!row) throw new Error('falha ao registrar sessão');
	return row.id;
}

/* ────────── RATE LIMIT ────────── */

/**
 * Conta planos gerados por um professional em uma janela de tempo.
 * Usado pra limitar `/alunos/[id]/gerar` e evitar abuse de quota Gemini.
 */
export async function countPlansGeneratedRecent(
	professionalId: string,
	windowMinutes: number
): Promise<number> {
	const result = await db.execute<{ count: number }>(sql`
		SELECT COUNT(*)::int AS count
		FROM training_plans
		WHERE professional_id = ${professionalId}
		  AND created_at >= now() - (${windowMinutes} || ' minutes')::interval
	`);
	const list = (result as unknown as { rows?: typeof result }).rows ?? result;
	const row = (list as Array<{ count: number }>)[0];
	return Number(row?.count ?? 0);
}

/* ────────── SESSION LOGS ────────── */

/**
 * Histórico das últimas execuções de uma sessão (label específico) de um plano.
 * Usado pra mostrar progressão de cargas pro profissional na visão da sessão.
 */
export type SessionLogEntry = {
	id: string;
	sessionDate: Date;
	sessionLabel: string | null;
	perceivedEffort: number | null;
	exercisesDone: Array<{
		name?: string;
		sets_done?: number;
		reps_done?: string;
		load_used?: string;
		completed?: boolean;
	}>;
};

export async function getRecentSessionLogs(
	planId: string,
	sessionLabel: string,
	limit = 5
): Promise<SessionLogEntry[]> {
	const rows = await db
		.select({
			id: trainingSessions.id,
			sessionDate: trainingSessions.sessionDate,
			sessionLabel: trainingSessions.sessionLabel,
			perceivedEffort: trainingSessions.perceivedEffort,
			exercisesDone: trainingSessions.exercisesDone
		})
		.from(trainingSessions)
		.where(
			and(eq(trainingSessions.planId, planId), eq(trainingSessions.sessionLabel, sessionLabel))
		)
		.orderBy(desc(trainingSessions.sessionDate))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		sessionDate: r.sessionDate,
		sessionLabel: r.sessionLabel,
		perceivedEffort: r.perceivedEffort,
		exercisesDone: (r.exercisesDone as SessionLogEntry['exercisesDone']) ?? []
	}));
}

/* ────────── DASHBOARD STATS ────────── */

export type DashboardStats = {
	activeStudents: number;
	totalStudents: number;
	totalPlans: number;
	activePlans: number;
	sessionsThisWeek: number;
	assessmentsLogged: number;
	/** 26*7 = 182 cells, 1 cell por dia. Valor = nº de sessões nesse dia. */
	heatmap: number[];
	heatmapMax: number;
	upcomingAppointments: Array<{
		id: string;
		startsAt: string;
		title: string | null;
		studentName: string | null;
	}>;
};

export async function getDashboardStats(professionalId: string): Promise<DashboardStats> {
	// Métricas + heatmap + próximos appointments em 3 queries paralelas.
	const [statsResult, heatmapResult, upcomingResult] = await Promise.all([
		db.execute<{
			active_students: number;
			all_plans: number;
			active_plans: number;
			sessions_7: number;
			assessments_total: number;
		}>(sql`
			SELECT
				(SELECT COUNT(*) FROM students
					WHERE professional_id = ${professionalId} AND deleted_at IS NULL)::int AS active_students,
				(SELECT COUNT(*) FROM training_plans
					WHERE professional_id = ${professionalId})::int AS all_plans,
				(SELECT COUNT(*) FROM training_plans
					WHERE professional_id = ${professionalId}
					  AND status IN ('published', 'generated'))::int AS active_plans,
				(SELECT COUNT(*) FROM training_sessions
					WHERE logged_by = ${professionalId}
					  AND session_date >= now() - interval '7 days')::int AS sessions_7,
				(SELECT COUNT(*) FROM physical_assessments
					WHERE created_by = ${professionalId})::int AS assessments_total
		`),
		// Heatmap: 26 semanas (182 dias) — count de sessões por dia
		db.execute<{ day_offset: number; sessions_count: number }>(sql`
			WITH days AS (
				SELECT generate_series(0, 181)::int AS day_offset
			)
			SELECT
				d.day_offset,
				COALESCE((
					SELECT COUNT(*) FROM training_sessions ts
					WHERE ts.logged_by = ${professionalId}
					  AND ts.session_date::date = (CURRENT_DATE - d.day_offset * INTERVAL '1 day')::date
				), 0)::int AS sessions_count
			FROM days d
			ORDER BY d.day_offset DESC
		`),
		// Próximos 7 dias de agendamentos
		db.execute<{
			id: string;
			starts_at: Date;
			title: string | null;
			student_name: string | null;
		}>(sql`
			SELECT
				a.id,
				a.starts_at,
				a.label AS title,
				s.name AS student_name
			FROM appointments a
			LEFT JOIN students s ON s.id = a.student_id
			WHERE a.professional_id = ${professionalId}
			  AND a.starts_at >= now()
			  AND a.starts_at < now() + interval '7 days'
			  AND a.status <> 'cancelled'
			ORDER BY a.starts_at ASC
			LIMIT 8
		`)
	]);

	const statsRows = (statsResult as unknown as { rows?: typeof statsResult }).rows ?? statsResult;
	const stats = (statsRows as Array<{
		active_students: number;
		all_plans: number;
		active_plans: number;
		sessions_7: number;
		assessments_total: number;
	}>)[0];

	const heatmapRows =
		(heatmapResult as unknown as { rows?: typeof heatmapResult }).rows ?? heatmapResult;
	const heatmap = (heatmapRows as Array<{ day_offset: number; sessions_count: number }>).map(
		(r) => Number(r.sessions_count)
	);
	const heatmapMax = heatmap.length > 0 ? Math.max(...heatmap, 1) : 1;

	const upcomingRows =
		(upcomingResult as unknown as { rows?: typeof upcomingResult }).rows ?? upcomingResult;
	const upcomingAppointments = (upcomingRows as Array<{
		id: string;
		starts_at: Date | string;
		title: string | null;
		student_name: string | null;
	}>).map((r) => ({
		id: r.id,
		startsAt: new Date(r.starts_at).toISOString(),
		title: r.title,
		studentName: r.student_name
	}));

	return {
		activeStudents: Number(stats?.active_students ?? 0),
		totalStudents: Number(stats?.active_students ?? 0),
		totalPlans: Number(stats?.all_plans ?? 0),
		activePlans: Number(stats?.active_plans ?? 0),
		sessionsThisWeek: Number(stats?.sessions_7 ?? 0),
		assessmentsLogged: Number(stats?.assessments_total ?? 0),
		heatmap,
		heatmapMax,
		upcomingAppointments
	};
}

/* ────────── EXERCISE CATALOG (ExerciseDB Pro — global) ────────── */

export type CatalogExercise = {
	id: string;
	externalId: string;
	name: string;
	nameEn: string;
	bodyPart: string;
	targetMuscle: string;
	secondaryMuscles: string[];
	equipment: string | null;
	difficulty: string | null;
	category: string | null;
	instructions: string[];
	description: string | null;
	videoUrl: string | null;
};

type CatalogRow = {
	id: string;
	external_id: string;
	name: string;
	name_en: string;
	body_part: string;
	target_muscle: string;
	secondary_muscles: string[] | null;
	equipment: string | null;
	difficulty: string | null;
	category: string | null;
	instructions: string[] | null;
	description: string | null;
	video_url: string | null;
};

function mapCatalogRow(r: CatalogRow): CatalogExercise {
	return {
		id: r.id,
		externalId: r.external_id,
		name: r.name,
		nameEn: r.name_en,
		bodyPart: r.body_part,
		targetMuscle: r.target_muscle,
		secondaryMuscles: r.secondary_muscles ?? [],
		equipment: r.equipment,
		difficulty: r.difficulty,
		category: r.category,
		instructions: r.instructions ?? [],
		description: r.description,
		videoUrl: r.video_url
	};
}

function unwrapRows<T>(result: unknown): T[] {
	const r = result as { rows?: T[] };
	return (r.rows ?? (result as T[])) ?? [];
}

/**
 * Busca paginada no catálogo. Filtros opcionais por bodyPart/equipment/difficulty
 * e texto livre (trigram no nome PT-BR + match no nome EN).
 */
export async function searchExerciseCatalog(opts: {
	query?: string;
	bodyPart?: string;
	equipment?: string;
	difficulty?: string;
	limit?: number;
	offset?: number;
}): Promise<{ items: CatalogExercise[]; total: number }> {
	const limit = Math.min(opts.limit ?? 60, 200);
	const offset = opts.offset ?? 0;
	const q = opts.query?.trim();

	const conds = [sql`1=1`];
	if (opts.bodyPart) conds.push(sql`body_part = ${opts.bodyPart}`);
	if (opts.equipment) conds.push(sql`equipment = ${opts.equipment}`);
	if (opts.difficulty) conds.push(sql`difficulty = ${opts.difficulty}`);
	if (q) conds.push(sql`(name ILIKE ${'%' + q + '%'} OR name_en ILIKE ${'%' + q + '%'})`);
	const where = sql.join(conds, sql` AND `);

	const [itemsResult, countResult] = await Promise.all([
		db.execute<CatalogRow>(sql`
			SELECT id, external_id, name, name_en, body_part, target_muscle,
			       secondary_muscles, equipment, difficulty, category,
			       instructions, description, video_url
			FROM exercise_catalog
			WHERE ${where}
			ORDER BY name
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ n: number }>(sql`
			SELECT COUNT(*)::int AS n FROM exercise_catalog WHERE ${where}
		`)
	]);

	const items = unwrapRows<CatalogRow>(itemsResult).map(mapCatalogRow);
	const total = Number(unwrapRows<{ n: number }>(countResult)[0]?.n ?? 0);
	return { items, total };
}

export async function getCatalogExercise(id: string): Promise<CatalogExercise | null> {
	const result = await db.execute<CatalogRow>(sql`
		SELECT id, external_id, name, name_en, body_part, target_muscle,
		       secondary_muscles, equipment, difficulty, category,
		       instructions, description, video_url
		FROM exercise_catalog WHERE id = ${id} LIMIT 1
	`);
	const row = unwrapRows<CatalogRow>(result)[0];
	return row ? mapCatalogRow(row) : null;
}

/**
 * Fuzzy match de um nome de exercício (PT ou EN) contra o catálogo,
 * via trigram similarity. Usado pra anexar vídeo aos exercícios que
 * a IA gera no plano. Retorna null se nenhum match passar do threshold.
 */
export async function matchCatalogByName(
	exerciseName: string,
	threshold = 0.3
): Promise<CatalogExercise | null> {
	const name = exerciseName.trim();
	if (name.length < 3) return null;
	const result = await db.execute<CatalogRow & { sim: number }>(sql`
		SELECT id, external_id, name, name_en, body_part, target_muscle,
		       secondary_muscles, equipment, difficulty, category,
		       instructions, description, video_url,
		       GREATEST(similarity(name, ${name}), similarity(name_en, ${name})) AS sim
		FROM exercise_catalog
		WHERE name % ${name} OR name_en % ${name}
		ORDER BY sim DESC
		LIMIT 1
	`);
	const row = unwrapRows<CatalogRow & { sim: number }>(result)[0];
	if (!row || Number(row.sim) < threshold) return null;
	return mapCatalogRow(row);
}

/** Facetas pros filtros da página de catálogo. */
export async function getCatalogFacets(): Promise<{
	total: number;
	bodyParts: { value: string; count: number }[];
	equipment: { value: string; count: number }[];
}> {
	const [totalRes, bpRes, eqRes] = await Promise.all([
		db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM exercise_catalog`),
		db.execute<{ value: string; count: number }>(sql`
			SELECT body_part AS value, COUNT(*)::int AS count
			FROM exercise_catalog GROUP BY body_part ORDER BY count DESC
		`),
		db.execute<{ value: string; count: number }>(sql`
			SELECT equipment AS value, COUNT(*)::int AS count
			FROM exercise_catalog WHERE equipment IS NOT NULL
			GROUP BY equipment ORDER BY count DESC LIMIT 20
		`)
	]);
	return {
		total: Number(unwrapRows<{ n: number }>(totalRes)[0]?.n ?? 0),
		bodyParts: unwrapRows<{ value: string; count: number }>(bpRes).map((r) => ({
			value: r.value,
			count: Number(r.count)
		})),
		equipment: unwrapRows<{ value: string; count: number }>(eqRes).map((r) => ({
			value: r.value,
			count: Number(r.count)
		}))
	};
}
