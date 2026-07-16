/**
 * Queries Drizzle centralizadas — toda interação com DB passa por aqui.
 * Filtragem por professional_id é responsabilidade dos callers (RLS também garante).
 */
import { eq, and, desc, asc, isNull, sql, count, gte, lte, inArray } from 'drizzle-orm';
import { db } from './db';
import { isUuid } from './validation';
import { localDateKey, startOfLocalDay, startOfLocalWeek, formatLocal } from './tz';
import { classifyExercise, tonnagePerSet } from '$lib/exercise-load';
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
	leads,
	feedback,
	type Professional,
	type Student,
	type HealthProfile,
	type TrainingPlan,
	type ExerciseLibraryItem,
	type Conversation,
	type Message,
	type Appointment,
	type Lead,
	type NewLead
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
	/** Sessões-alvo/semana das preferências. null = não definido. */
	weeklyTarget: number | null;
	adherence: number;
	sessions7: number;
	last: string | null;
	/** Dias desde a última sessão (calendário). null = nunca treinou. */
	daysSinceLast: number | null;
	streak: number;
	/** Maior PSE (0–10) reportado nos últimos 7 dias. null = sem sessão. */
	maxRpe7: number | null;
	/** Observação recente mais recente (últimos 14d), se houver. */
	lastObs: string | null;
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

export async function getStudentsByProfessional(
	professionalId: string
): Promise<StudentListItem[]> {
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
		max_rpe_7: number | null;
		last_obs: string | null;
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
			), 0)::int AS streak,
			-- Sinais de atenção: maior PSE da semana e última observação recente.
			(
				SELECT MAX(perceived_effort) FROM training_sessions
				WHERE student_id = s.id
				  AND session_date >= now() - interval '7 days'
			) AS max_rpe_7,
			(
				SELECT observations FROM training_sessions
				WHERE student_id = s.id
				  AND observations IS NOT NULL AND btrim(observations) <> ''
				  AND session_date >= now() - interval '14 days'
				ORDER BY session_date DESC LIMIT 1
			) AS last_obs
		FROM students s
		LEFT JOIN training_preferences tp ON tp.student_id = s.id
		WHERE s.professional_id = ${professionalId}
		  AND s.deleted_at IS NULL
		ORDER BY s.name
	`);

	const list = (rows as unknown as { rows?: typeof rows }).rows ?? rows;

	return (
		list as Array<{
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
			max_rpe_7: number | null;
			last_obs: string | null;
		}>
	).map((r) => {
		const sessions7 = Number(r.sessions_7 ?? 0);
		const goal = r.goals?.[0];
		const goalLabel = goal ? (GOAL_LABELS[goal] ?? goal) : null;
		// Plano em produção (pending/generating) também conta como ativo — sem
		// isso o aluno aparecia como "Pausado" no meio da geração (M18).
		const status: 'active' | 'paused' =
			r.plan_status === 'published' ||
			r.plan_status === 'generated' ||
			r.plan_status === 'pending' ||
			r.plan_status === 'generating'
				? 'active'
				: 'paused';
		const lastDate = r.last_session ? new Date(r.last_session) : null;
		// formatLocal: data em Brasília — em UTC, treino de 21h+ virava "amanhã".
		const lastFmt = lastDate
			? formatLocal(lastDate, { day: '2-digit', month: 'short' }).replace('.', '')
			: null;
		// Dias de calendário desde a última sessão (Brasília). Alimenta a regra
		// "sumido" do motor de atenção sem precisar de outra ida ao banco.
		const daysSinceLast = lastDate
			? Math.max(
					0,
					Math.floor(
						(startOfLocalDay(new Date()).getTime() - startOfLocalDay(lastDate).getTime()) /
							86_400_000
					)
				)
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
			weeklyTarget: r.weekly_sessions ?? null,
			adherence,
			sessions7,
			last: lastFmt,
			daysSinceLast,
			streak: Number(r.streak ?? 0),
			maxRpe7: r.max_rpe_7 !== null ? Number(r.max_rpe_7) : null,
			lastObs: r.last_obs ?? null,
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
	assessments: (typeof physicalAssessments.$inferSelect)[];
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
		current !== null && first !== null && first !== 0 ? ((current - first) / first) * 100 : null;
	return { values, current, first, deltaPct };
}

export async function getStudentDetail(
	studentId: string,
	professionalId: string
): Promise<StudentDetail | null> {
	if (!isUuid(studentId) || !isUuid(professionalId)) return null;
	const studentRows = await db
		.select()
		.from(students)
		.where(
			and(
				eq(students.id, studentId),
				eq(students.professionalId, professionalId),
				isNull(students.deletedAt)
			)
		)
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
	const seriesBodyFat = recent8.map((a) => a.bodyFatPct).filter((v): v is number => v !== null);
	const seriesRestingHr = recent8.map((a) => a.restingHr).filter((v): v is number => v !== null);
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
		// isNull(students.deletedAt): aluno soft-deletado some de /alunos — os
		// planos dele não podem continuar listados em /planos.
		.where(and(eq(trainingPlans.professionalId, professionalId), isNull(students.deletedAt)))
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
	source?: {
		type: string;
		rule_code?: string;
		chunk_id?: string;
		source_id?: string;
		note?: string;
	};
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
	// Campos da ficha de prescrição (modelo impresso)
	intensity?: string;
	series_label?: string;
	cadence?: string;
	tempo?: string;
	muscle_action?: 'isotonica' | 'isometrica' | 'auxotonico' | 'isocinetica';
	range_of_motion?: string;
	rest_label?: string;
	source_refs?: {
		type: string;
		note?: string;
		chunk_id?: string;
		source_id?: string;
		page_number?: number;
	}[];
};

export type PlanAerobic = {
	means: string;
	weekly_frequency?: string;
	method: string;
	pause?: string;
	intensity: string;
	volume: string;
	observations?: string;
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
	day_of_week?: 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
	duration_minutes?: number;
	warmup?: PlanExercise[];
	main?: PlanExercise[];
	cooldown?: PlanExercise[];
	observations?: string;
};

export type PlanData = {
	summary?: string;
	objective?: string;
	program_weeks?: number;
	restrictions?: PlanRestriction[];
	weekly_sessions?: PlanSessionData[];
	aerobic_prescriptions?: PlanAerobic[];
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
 *
 * Wrapper defensivo: planos failed têm planData parcial. Erro aqui não
 * deve derrubar a página inteira com 500.
 */
async function collectAndEnrichSources(planData: PlanData): Promise<SourceMap> {
	try {
		return await collectAndEnrichSourcesInner(planData);
	} catch (err) {
		console.error('collectAndEnrichSources.failed', String(err).slice(0, 300));
		return {};
	}
}

async function collectAndEnrichSourcesInner(planData: PlanData): Promise<SourceMap> {
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
 *
 * Defensivo: planos de status=failed têm planData PARCIAL (sessões sem
 * warmup/cooldown, exercícios incompletos). Qualquer throw aqui derruba
 * a página inteira com 500. try/catch garante que a página renderiza
 * mesmo se o enriquecimento falhar — UI degrada para "sem vídeo" em vez
 * de quebrar tudo.
 */
async function collectAndEnrichCatalog(planData: PlanData): Promise<CatalogMap> {
	try {
		return await collectAndEnrichCatalogInner(planData);
	} catch (err) {
		console.error('collectAndEnrichCatalog.failed', String(err).slice(0, 300));
		return {};
	}
}

async function collectAndEnrichCatalogInner(planData: PlanData): Promise<CatalogMap> {
	const ids = new Set<string>();
	for (const session of planData.weekly_sessions ?? []) {
		if (!session || typeof session !== 'object') continue;
		for (const block of [session.warmup ?? [], session.main ?? [], session.cooldown ?? []]) {
			if (!Array.isArray(block)) continue;
			for (const ex of block) {
				if (
					ex &&
					typeof ex === 'object' &&
					typeof ex.catalog_id === 'string' &&
					/^\d{4,5}$/.test(ex.catalog_id)
				) {
					ids.add(ex.catalog_id);
				}
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
	if (!isUuid(planId) || !isUuid(professionalId)) return null;
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
	/** null no modo link: o TITULAR consente depois, no /completar (LGPD art. 11). */
	consentAcceptedAt: Date | null;
	diagnoses: { label: string; severity?: 'leve' | 'moderada' | 'grave' }[];
	medications: { name: string; dose?: string; frequency?: string }[];
	/** Limitações físicas / lesões — regiões com restrição de amplitude
	 *  ou dor. Persistido em healthProfile.injuries. */
	injuries?: { region: string; notes?: string }[];
	cardiovascularRisk: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	experienceLevel: 'iniciante' | 'intermediario' | 'avancado';
	prescribedDifficulty?: 'pequena' | 'media' | 'alta';
	trainingSplit?: 'auto' | 'full_body' | 'upper_lower' | 'push_pull_legs';
	weeklySessions: number;
	minutesPerSession: number;
	goals: string[];
	equipmentAvailable?: string[];
	/** false = aluno criado via link, vai preencher o resto depois. */
	profileComplete?: boolean;
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
				// Versão dos termos só carimba junto do consentimento — no modo
				// link ambas ficam null até o aluno consentir no /completar.
				consentTermsVersion: input.consentAcceptedAt ? 'v1.0' : null,
				profileCompletedAt: input.profileComplete === false ? null : new Date()
			})
			.returning({ id: students.id });
		if (!s) throw new Error('falha ao criar aluno');

		await tx.insert(healthProfiles).values({
			studentId: s.id,
			diagnoses: input.diagnoses,
			medications: input.medications,
			injuries: input.injuries ?? [],
			cardiovascularRisk: input.cardiovascularRisk
		});

		await tx.insert(trainingPreferences).values({
			studentId: s.id,
			experienceLevel: input.experienceLevel,
			prescribedDifficulty: input.prescribedDifficulty ?? 'media',
			trainingSplit: input.trainingSplit ?? 'auto',
			weeklySessions: input.weeklySessions,
			minutesPerSession: input.minutesPerSession,
			goals: input.goals,
			equipmentAvailable: input.equipmentAvailable ?? [],
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
		// Defesa em profundidade (a rota já valida): aluno TEM que pertencer ao
		// profissional — sem isso o insert + update de peso vazaria pra aluno alheio.
		const [owned] = await tx
			.select({ id: students.id })
			.from(students)
			.where(
				and(
					eq(students.id, input.studentId),
					eq(students.professionalId, input.professionalId),
					isNull(students.deletedAt)
				)
			)
			.limit(1);
		if (!owned) throw new Error('aluno não encontrado ou não pertence a este profissional');

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
		if (input.bodyFatPct)
			recs.push({ metricType: 'body_fat_pct', value: input.bodyFatPct, unit: '%' });
		if (input.bmi) recs.push({ metricType: 'bmi', value: input.bmi, unit: 'kg/m2' });
		if (input.leanMassKg)
			recs.push({ metricType: 'lean_mass', value: input.leanMassKg, unit: 'kg' });

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
				.where(
					and(eq(students.id, input.studentId), eq(students.professionalId, input.professionalId))
				);
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
	injuries?: { region: string; notes?: string }[];
	cardiovascularRisk: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	experienceLevel: 'iniciante' | 'intermediario' | 'avancado';
	prescribedDifficulty?: 'pequena' | 'media' | 'alta';
	trainingSplit?: 'auto' | 'full_body' | 'upper_lower' | 'push_pull_legs';
	weeklySessions: number;
	minutesPerSession: number;
	goals: string[];
	equipmentAvailable?: string[];
};

export async function updateStudentTx(input: UpdateStudentInput): Promise<void> {
	await db.transaction(async (tx) => {
		const [s] = await tx
			.select({ id: students.id })
			.from(students)
			.where(
				and(eq(students.id, input.studentId), eq(students.professionalId, input.professionalId))
			)
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
				// Editar pelo profissional conclui o perfil (se ainda estava pendente)
				profileCompletedAt: sql`coalesce(${students.profileCompletedAt}, now())`,
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
					injuries: input.injuries ?? [],
					cardiovascularRisk: input.cardiovascularRisk,
					updatedAt: new Date()
				})
				.where(eq(healthProfiles.id, hp.id));
		} else {
			await tx.insert(healthProfiles).values({
				studentId: input.studentId,
				diagnoses: input.diagnoses,
				medications: input.medications,
				injuries: input.injuries ?? [],
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
					...(input.prescribedDifficulty
						? { prescribedDifficulty: input.prescribedDifficulty }
						: {}),
					...(input.trainingSplit ? { trainingSplit: input.trainingSplit } : {}),
					weeklySessions: input.weeklySessions,
					minutesPerSession: input.minutesPerSession,
					goals: input.goals,
					...(input.equipmentAvailable ? { equipmentAvailable: input.equipmentAvailable } : {}),
					updatedAt: new Date()
				})
				.where(eq(trainingPreferences.id, pref.id));
		} else {
			await tx.insert(trainingPreferences).values({
				studentId: input.studentId,
				experienceLevel: input.experienceLevel,
				prescribedDifficulty: input.prescribedDifficulty ?? 'media',
				weeklySessions: input.weeklySessions,
				minutesPerSession: input.minutesPerSession,
				goals: input.goals,
				equipmentAvailable: input.equipmentAvailable ?? [],
				preferredModalities: ['musculacao']
			});
		}
	});
}

/* ────────── AUTO-PREENCHIMENTO PELO ALUNO ────────── */

export type AlunoSelfFillData = {
	student: { id: string; name: string; birthDate: string | null; profileCompletedAt: Date | null };
	professional: { name: string };
	healthProfile: typeof healthProfiles.$inferSelect | null;
	preferences: typeof trainingPreferences.$inferSelect | null;
};

/** Carrega os dados que o aluno preenche pelo link — sem auth de profissional (rota é token-gated). */
export async function getAlunoSelfFillData(studentId: string): Promise<AlunoSelfFillData | null> {
	if (!isUuid(studentId)) return null;
	const [s] = await db
		.select()
		.from(students)
		.where(and(eq(students.id, studentId), isNull(students.deletedAt)))
		.limit(1);
	if (!s) return null;

	const [pro] = await db
		.select({ name: professionals.name })
		.from(professionals)
		.where(eq(professionals.id, s.professionalId))
		.limit(1);
	if (!pro) return null;

	const [hp] = await db
		.select()
		.from(healthProfiles)
		.where(eq(healthProfiles.studentId, studentId))
		.limit(1);
	const [pref] = await db
		.select()
		.from(trainingPreferences)
		.where(eq(trainingPreferences.studentId, studentId))
		.limit(1);

	return {
		student: {
			id: s.id,
			name: s.name,
			birthDate: s.birthDate,
			profileCompletedAt: s.profileCompletedAt
		},
		professional: { name: pro.name },
		healthProfile: hp ?? null,
		preferences: pref ?? null
	};
}

export type CompleteStudentSelfFillInput = {
	studentId: string;
	birthDate?: string | null;
	weightKg?: number | null;
	heightCm?: number | null;
	phone?: string | null;
	diagnoses: { label: string }[];
	medications: { name: string }[];
	injuries?: { region: string; notes?: string }[];
	cardiovascularRisk: 'baixo' | 'moderado' | 'alto' | 'muito_alto';
	experienceLevel: 'iniciante' | 'intermediario' | 'avancado';
	prescribedDifficulty: 'pequena' | 'media' | 'alta';
	trainingSplit?: 'auto' | 'full_body' | 'upper_lower' | 'push_pull_legs';
	weeklySessions: number;
	minutesPerSession: number;
	goals: string[];
};

/** O próprio aluno completa o perfil pelo link. Não exige profissional (rota token-gated). */
export async function completeStudentSelfFillTx(
	input: CompleteStudentSelfFillInput
): Promise<void> {
	await db.transaction(async (tx) => {
		const [s] = await tx
			.select({ id: students.id })
			.from(students)
			.where(and(eq(students.id, input.studentId), isNull(students.deletedAt)))
			.limit(1);
		if (!s) throw new Error('aluno não encontrado');

		// Merge não-destrutivo: reenvio do link é fluxo intencional, mas campo
		// omitido/vazio NÃO pode anular dado já registrado pelo profissional
		// (ex.: peso atualizado por avaliação física). Só grava o que veio.
		await tx
			.update(students)
			.set({
				...(input.birthDate != null ? { birthDate: input.birthDate } : {}),
				...(input.weightKg != null ? { weightKg: input.weightKg } : {}),
				...(input.heightCm != null ? { heightCm: input.heightCm } : {}),
				...(input.phone != null ? { phone: input.phone } : {}),
				consentAcceptedAt: sql`coalesce(${students.consentAcceptedAt}, now())`,
				consentTermsVersion: 'v1.0',
				profileCompletedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(students.id, input.studentId));

		const [hp] = await tx
			.select({
				id: healthProfiles.id,
				diagnoses: healthProfiles.diagnoses,
				medications: healthProfiles.medications,
				injuries: healthProfiles.injuries
			})
			.from(healthProfiles)
			.where(eq(healthProfiles.studentId, input.studentId))
			.limit(1);
		if (hp) {
			// Reenvio do autopreenchimento NÃO pode achatar refinamento do
			// profissional: item que já existe (por label/name/region) preserva
			// os campos ricos (severity/dose/frequency/since/notes) e só recebe
			// por cima o que o aluno reenviou.
			const norm = (v: unknown) =>
				String(v ?? '')
					.trim()
					.toLowerCase();
			const mergeByKey = <T extends Record<string, unknown>>(
				incoming: T[],
				existing: unknown,
				key: string
			): T[] => {
				const prevList = Array.isArray(existing) ? (existing as Record<string, unknown>[]) : [];
				return incoming.map((item) => {
					const prev = prevList.find((e) => norm(e[key]) === norm(item[key]));
					return prev ? ({ ...prev, ...item } as T) : item;
				});
			};
			await tx
				.update(healthProfiles)
				.set({
					diagnoses: mergeByKey(input.diagnoses, hp.diagnoses, 'label'),
					medications: mergeByKey(input.medications, hp.medications, 'name'),
					injuries: mergeByKey(input.injuries ?? [], hp.injuries, 'region'),
					cardiovascularRisk: input.cardiovascularRisk,
					updatedAt: new Date()
				})
				.where(eq(healthProfiles.id, hp.id));
		} else {
			await tx.insert(healthProfiles).values({
				studentId: input.studentId,
				diagnoses: input.diagnoses,
				medications: input.medications,
				injuries: input.injuries ?? [],
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
					prescribedDifficulty: input.prescribedDifficulty,
					trainingSplit: input.trainingSplit ?? 'auto',
					weeklySessions: input.weeklySessions,
					minutesPerSession: input.minutesPerSession,
					goals: input.goals,
					updatedAt: new Date()
				})
				.where(eq(trainingPreferences.id, pref.id));
		} else {
			await tx.insert(trainingPreferences).values({
				studentId: input.studentId,
				experienceLevel: input.experienceLevel,
				prescribedDifficulty: input.prescribedDifficulty,
				weeklySessions: input.weeklySessions,
				minutesPerSession: input.minutesPerSession,
				goals: input.goals,
				equipmentAvailable: [],
				preferredModalities: ['musculacao']
			});
		}
	});
}

export async function softDeleteStudent(studentId: string, professionalId: string): Promise<void> {
	if (!isUuid(studentId) || !isUuid(professionalId)) return;
	await db
		.update(students)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(students.id, studentId), eq(students.professionalId, professionalId)));
}

/* ────────── PLAN STATUS ────────── */

export type PublishResult = { ok: boolean; reason?: string };

export async function publishPlan(planId: string, professionalId: string): Promise<PublishResult> {
	if (!isUuid(planId) || !isUuid(professionalId))
		return { ok: false, reason: 'plano não encontrado' };
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
	if (plan.professionalId !== professionalId)
		return { ok: false, reason: 'plano não pertence a este profissional' };
	if (plan.status !== 'generated')
		return {
			ok: false,
			reason: `plano em status "${plan.status}" — só "generated" pode ser publicado`
		};

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
	if (!isUuid(planId) || !isUuid(professionalId)) return;
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

// Campos opcionais aceitam null explícito (= limpar a coluna) além de
// undefined (= não mexer — Drizzle omite colunas undefined do UPDATE).
// Sem isso era impossível apagar uma observação/equipment já salvos.
export type CreateExerciseInput = {
	professionalId: string;
	code?: string | null;
	name: string;
	muscleGroup: string;
	equipment?: string | null;
	level?: string | null;
	pattern?: string | null;
	executionNotes?: string | null;
	contraindications: string[];
};

export type UpdateAppointmentInput = {
	appointmentId: string;
	professionalId: string;
	studentId: string | null;
	startsAt: Date;
	durationMinutes: number;
	type: 'treino' | 'avaliacao' | 'reabilitacao' | 'consulta';
	label?: string | null;
	notes?: string | null;
	status: 'scheduled' | 'completed' | 'cancelled';
};

export async function getAppointmentById(
	appointmentId: string,
	professionalId: string
): Promise<AppointmentRow | null> {
	if (!isUuid(appointmentId) || !isUuid(professionalId)) return null;
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
	if (!isUuid(input.appointmentId) || !isUuid(input.professionalId)) return;
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

export async function deleteAppointment(
	appointmentId: string,
	professionalId: string
): Promise<void> {
	if (!isUuid(appointmentId) || !isUuid(professionalId)) return;
	await db
		.delete(appointments)
		.where(
			and(eq(appointments.id, appointmentId), eq(appointments.professionalId, professionalId))
		);
}

export type UpdateExerciseInput = CreateExerciseInput & { exerciseId: string };

export async function getExerciseById(
	exerciseId: string,
	professionalId: string
): Promise<ExerciseLibraryItem | null> {
	if (!isUuid(exerciseId) || !isUuid(professionalId)) return null;
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
	if (!isUuid(input.exerciseId) || !isUuid(input.professionalId)) return;
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
	if (!isUuid(exerciseId) || !isUuid(professionalId)) return;
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
	// Última mensagem via correlated subquery — 1 round-trip pro Postgres.
	// Antes era N+1 (uma query por conversa; 50 alunos = 51 queries).
	const rows = await db
		.select({
			id: conversations.id,
			studentId: conversations.studentId,
			studentName: students.name,
			lastAt: conversations.lastMessageAt,
			unread: conversations.unreadCount,
			lastBody: sql<string | null>`(
				SELECT m.body FROM messages m
				WHERE m.conversation_id = ${conversations.id}
				ORDER BY m.created_at DESC LIMIT 1
			)`
		})
		.from(conversations)
		.leftJoin(students, eq(students.id, conversations.studentId))
		.where(eq(conversations.professionalId, professionalId))
		.orderBy(desc(conversations.lastMessageAt));

	return rows.map((r) => ({
		id: r.id,
		studentId: r.studentId,
		studentName: r.studentName ?? '—',
		last: r.lastBody?.slice(0, 80) ?? null,
		lastAt: r.lastAt,
		unread: r.unread,
		// Não rastreamos presença — era Math.random() (status fake pro user).
		// Sempre false até existir presence channel de verdade.
		online: false
	}));
}

/**
 * Verifica que a conversation pertence ao professional. Toda leitura/escrita
 * de mensagem DEVE passar por aqui — sem isso, qualquer profissional logado
 * lia/escrevia em threads de outros só trocando o conversationId da URL/form.
 */
export async function conversationBelongsTo(
	conversationId: string,
	professionalId: string
): Promise<boolean> {
	// Sem o guard, /mensagens?t=<não-uuid> estourava 22P02 no Postgres → 500.
	if (!isUuid(conversationId) || !isUuid(professionalId)) return false;
	const [c] = await db
		.select({ id: conversations.id })
		.from(conversations)
		.where(
			and(eq(conversations.id, conversationId), eq(conversations.professionalId, professionalId))
		)
		.limit(1);
	return Boolean(c);
}

export async function getMessagesForThread(
	conversationId: string,
	professionalId: string
): Promise<Message[]> {
	if (!(await conversationBelongsTo(conversationId, professionalId))) return [];
	return db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(asc(messages.createdAt));
}

export async function postMessage(
	conversationId: string,
	body: string,
	fromRole: 'professional' | 'student',
	/** Obrigatório quando fromRole=professional — valida ownership da thread. */
	professionalId?: string
): Promise<Message> {
	if (fromRole === 'professional') {
		if (!professionalId || !(await conversationBelongsTo(conversationId, professionalId))) {
			throw new Error('Conversa não encontrada ou não pertence a este profissional.');
		}
	}
	const [m] = await db.insert(messages).values({ conversationId, body, fromRole }).returning();
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
	/** Sessões concluídas na semana corrente (segunda → hoje). Alimenta o card "Esta semana". */
	sessionsThisWeek: number;
	streakDays: number;
	/** Meta semanal de treinos — vem de training_preferences.weeklySessions. */
	weeklyTarget: number;
};

export async function getAlunoAppData(studentId: string): Promise<AlunoAppData | null> {
	if (!isUuid(studentId)) return null;
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

	// SÓ planos publicados. 'generated' ainda não passou pela revisão do
	// profissional — red flags clínicas BLOQUEIAM a publicação exatamente
	// pra o aluno não treinar um plano contraindicado. Incluir 'generated'
	// aqui anulava esse gate (aluno via plano com restrições críticas).
	const [planRow] = await db
		.select()
		.from(trainingPlans)
		.where(and(eq(trainingPlans.studentId, studentId), eq(trainingPlans.status, 'published')))
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
				planData: (planRow.planData as PlanData) ?? {},
				sourceMap: {},
				catalogMap: {}
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

	// Streak com query dedicada janelada por data — usar as 10 linhas do
	// recentSessions travava o streak em 10 dias pros alunos mais assíduos.
	// 120 dias cobre qualquer streak realista; computeStreak deduplica por dia.
	const streakSince = new Date(Date.now() - 120 * 86_400_000);
	const streakRows = await db
		.select({ sessionDate: trainingSessions.sessionDate })
		.from(trainingSessions)
		.where(
			and(eq(trainingSessions.studentId, studentId), gte(trainingSessions.sessionDate, streakSince))
		);
	const streakDays = computeStreak(streakRows.map((r) => r.sessionDate));

	// Sessões da semana corrente (segunda 00:00 de Brasília → agora) — count
	// dedicado pra não confundir com as "últimas 10 sessões" do recentSessions.
	// Fronteira via tz: o server roda em UTC e deslocava a virada de semana em 3h.
	const weekStart = startOfLocalWeek(new Date());
	const [weekCount] = await db
		.select({ n: count() })
		.from(trainingSessions)
		.where(
			and(eq(trainingSessions.studentId, studentId), gte(trainingSessions.sessionDate, weekStart))
		);

	// Meta semanal real do aluno (era hardcoded 5 na UI)
	const [prefRow] = await db
		.select({ weeklySessions: trainingPreferences.weeklySessions })
		.from(trainingPreferences)
		.where(eq(trainingPreferences.studentId, studentId))
		.limit(1);

	return {
		student: { id: s.id, name: s.name, weightKg: s.weightKg, heightCm: s.heightCm },
		professional: { id: pro.id, name: pro.name, cref: pro.cref },
		plan,
		recentSessions: sessRows,
		sessionsThisWeek: Number(weekCount?.n ?? 0),
		streakDays,
		weeklyTarget: prefRow?.weeklySessions ?? 3
	};
}

function computeStreak(dates: Date[]): number {
	if (dates.length === 0) return 0;
	// Chaves de dia no fuso de Brasília — em UTC, treino depois das 21h BRT
	// caía no dia seguinte e quebrava/inflava o streak.
	const days = new Set(dates.map((d) => localDateKey(new Date(d))));
	let streak = 0;
	const now = new Date();
	for (let i = 0; i < 365; i++) {
		const key = localDateKey(new Date(now.getTime() - i * 86_400_000));
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
		set_logs?: { weight: number; reps: number }[];
		/** % da carga máxima usada hoje (informado pelo aluno, #1). */
		intensity_used?: number;
		notes?: string;
		completed: boolean;
	}[];
	perceivedEffort?: number;
	durationMinutes?: number;
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
			durationMinutes: input.durationMinutes,
			observations: input.observations
		})
		.returning({ id: trainingSessions.id });
	if (!row) throw new Error('falha ao registrar sessão');
	return row.id;
}

/* ────────── CARGA INTERNA × EXTERNA (evolução de treino) ────────── */

/**
 * Converte string de reps numa representação numérica.
 * "10" → 10 | "8-12" → 10 (média) | "8 a 12" → 10 | "amrap"/"máx" → 0
 */
function parseRepsToNumber(reps: string | undefined | null): number {
	if (!reps) return 0;
	const s = String(reps).toLowerCase().trim();
	const range = s.match(/(\d+)\s*(?:-|–|a|to|até|\/)\s*(\d+)/);
	if (range) return (Number(range[1]) + Number(range[2])) / 2;
	const single = s.match(/(\d+)/);
	return single ? Number(single[1]) : 0;
}

/**
 * Extrai kg da string de carga. "20kg" → 20 | "20,5" → 20.5 |
 * "peso corporal"/"livre" → 0 (não entra na tonelagem).
 */
function parseLoadToKg(load: string | undefined | null): number {
	if (!load) return 0;
	const s = String(load).toLowerCase().trim();
	const withKg = s.match(/(\d+(?:[.,]\d+)?)\s*kg/);
	if (withKg) return Number(withKg[1]!.replace(',', '.'));
	// Sem "kg" explícito: só conta se a string for essencialmente numérica
	// (evita pegar "10 reps" como carga). Aceita "20", "20,5".
	const pure = s.match(/^(\d+(?:[.,]\d+)?)$/);
	if (pure) return Number(pure[1]!.replace(',', '.'));
	return 0;
}

export type LoadWeek = {
	weekStart: string; // ISO date (segunda)
	weekLabel: string; // "12/mai"
	tonnage: number; // carga externa em kg (Σ sets×reps×kg)
	repVolume: number; // volume total de reps (Σ sets×reps) — fallback p/ peso corporal
	internalLoad: number; // carga interna sRPE (Σ PSE×duração) em UA
	sessions: number;
	avgRpe: number | null;
};

export type LoadEvolution = {
	weeks: LoadWeek[];
	hasData: boolean;
	/** Métrica externa a exibir: tonelagem se houver peso, senão volume de reps */
	externalMetric: 'tonnage' | 'volume';
	totalSessions: number;
};

/**
 * Evolução de carga das últimas `weeks` semanas. Agrega sessões por semana
 * calculando carga externa (tonelagem) e interna (session-RPE).
 */
export async function getStudentLoadEvolution(
	studentId: string,
	weeksBack = 12
): Promise<LoadEvolution> {
	if (!isUuid(studentId)) {
		return { weeks: [], hasData: false, externalMetric: 'volume', totalSessions: 0 };
	}
	// Peso do aluno — necessário pra estimar tonelagem de exercício bodyweight
	// (bodyweight_kg × reps × 0.65, ver $lib/exercise-load).
	const [stu] = await db
		.select({ weightKg: students.weightKg })
		.from(students)
		.where(eq(students.id, studentId))
		.limit(1);

	const since = startOfLocalDay(new Date(Date.now() - weeksBack * 7 * 86_400_000));

	const rows = await db
		.select({
			sessionDate: trainingSessions.sessionDate,
			perceivedEffort: trainingSessions.perceivedEffort,
			durationMinutes: trainingSessions.durationMinutes,
			exercisesDone: trainingSessions.exercisesDone
		})
		.from(trainingSessions)
		.where(and(eq(trainingSessions.studentId, studentId), gte(trainingSessions.sessionDate, since)))
		.orderBy(asc(trainingSessions.sessionDate));

	// Inicializa buckets pra TODAS as semanas (mesmo vazias) → timeline contínua.
	// Fronteiras em horário de Brasília (server roda em UTC): sessão de domingo
	// 21h30 BRT caía na segunda UTC e migrava pra semana seguinte.
	// A semana CORRENTE (parcial) fica de fora (i < weeksBack): com 1-2 treinos
	// ela virava a "carga aguda" do ACWR e o veredito do gráfico disparava
	// "subcarga"/"volume caindo" toda segunda/terça — só semanas completas.
	const buckets = new Map<string, LoadWeek>();
	const firstMonday = startOfLocalWeek(since);
	for (let i = 0; i < weeksBack; i++) {
		const ws = new Date(firstMonday.getTime() + i * 7 * 86_400_000);
		const key = localDateKey(ws);
		buckets.set(key, {
			weekStart: key,
			weekLabel: formatLocal(ws, { day: '2-digit', month: 'short' }).replace('.', ''),
			tonnage: 0,
			repVolume: 0,
			internalLoad: 0,
			sessions: 0,
			avgRpe: null
		});
	}

	const rpeSum = new Map<string, { sum: number; n: number }>();
	// Séries que geraram kg vs séries contadas (exclui `time`) — decide a
	// métrica externa lá embaixo sem deixar um único halter mascarar calistenia.
	let tonnageSets = 0;
	let countedSets = 0;

	for (const row of rows) {
		const key = localDateKey(startOfLocalWeek(new Date(row.sessionDate)));
		const bucket = buckets.get(key);
		if (!bucket) continue;

		bucket.sessions += 1;

		// Carga externa: percorre exercícios feitos.
		// Preferência: set_logs (peso×reps reais por série). Fallback: modelo
		// antigo (sets_done × reps × load_used em texto) pra logs anteriores.
		for (const ex of row.exercisesDone ?? []) {
			// set_logs preenchido conta mesmo sem o toque em "concluído" —
			// série registrada é trabalho executado.
			if (!ex.completed && !(ex.set_logs && ex.set_logs.length > 0)) continue;
			// Classificação por nome (retrocompatível com logs antigos):
			//  - `time`: weight guarda SEGUNDOS — nunca soma na tonelagem
			//    (a carga desses entra via sRPE na carga interna);
			//  - `bodyweight`: estima kg via peso do aluno (× reps × 0.65).
			const kind = classifyExercise({ name: ex.name ?? '' });
			if (ex.set_logs && ex.set_logs.length > 0) {
				for (const sl of ex.set_logs) {
					const w = Number(sl.weight) || 0;
					const r = Number(sl.reps) || 0;
					bucket.repVolume += r;
					if (kind === 'time') continue;
					const t =
						kind === 'bodyweight'
							? tonnagePerSet({ kind, reps: r, bodyweightKg: stu?.weightKg })
							: w * r;
					bucket.tonnage += t;
					countedSets += 1;
					if (t > 0) tonnageSets += 1;
				}
			} else {
				const sets = Number(ex.sets_done) || 0;
				const reps = parseRepsToNumber(ex.reps_done);
				bucket.repVolume += sets * reps;
				if (kind === 'time') continue;
				const perSet =
					kind === 'bodyweight'
						? tonnagePerSet({ kind, reps, bodyweightKg: stu?.weightKg })
						: reps * parseLoadToKg(ex.load_used);
				bucket.tonnage += sets * perSet;
				countedSets += sets;
				if (perSet > 0) tonnageSets += sets;
			}
		}

		// Carga interna: session-RPE = PSE × duração
		const pse = row.perceivedEffort ?? 0;
		const dur = row.durationMinutes ?? 0;
		if (pse > 0) {
			bucket.internalLoad += pse * dur;
			const acc = rpeSum.get(key) ?? { sum: 0, n: 0 };
			acc.sum += pse;
			acc.n += 1;
			rpeSum.set(key, acc);
		}
	}

	for (const [key, acc] of rpeSum) {
		const bucket = buckets.get(key);
		if (bucket && acc.n > 0) bucket.avgRpe = Math.round((acc.sum / acc.n) * 10) / 10;
	}

	const weeks = Array.from(buckets.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
	const totalTonnage = weeks.reduce((s, w) => s + w.tonnage, 0);
	const totalSessions = weeks.reduce((s, w) => s + w.sessions, 0);

	return {
		weeks,
		hasData: totalSessions > 0,
		// Tonelagem só quando a MAIORIA das séries gerou kg — evita que um único
		// halter esconda o trabalho calistênico de aluno sem peso cadastrado.
		externalMetric: totalTonnage > 0 && tonnageSets * 2 >= countedSets ? 'tonnage' : 'volume',
		totalSessions
	};
}

/* ────────── HISTÓRICO DE TREINO (ficha) ────────── */

export type RecentSession = {
	id: string;
	date: string; // ISO — formatado no client em Brasília
	label: string | null;
	perceivedEffort: number | null;
	durationMinutes: number | null;
	/** Exercícios marcados como feitos / total logado. */
	doneCount: number;
	totalCount: number;
	observations: string | null;
};

/**
 * Últimas sessões executadas pelo aluno — expõe na ficha o dado que hoje só
 * entra em agregado (PSE, observações, exercícios feitos). É onde o "joelho
 * doeu" fica visível pro profissional. Guarda por professionalId (posse).
 */
export async function getRecentTrainingSessions(
	studentId: string,
	professionalId: string,
	limit = 20
): Promise<RecentSession[]> {
	if (!isUuid(studentId) || !isUuid(professionalId)) return [];
	const rows = await db
		.select({
			id: trainingSessions.id,
			sessionDate: trainingSessions.sessionDate,
			sessionLabel: trainingSessions.sessionLabel,
			perceivedEffort: trainingSessions.perceivedEffort,
			durationMinutes: trainingSessions.durationMinutes,
			exercisesDone: trainingSessions.exercisesDone,
			observations: trainingSessions.observations
		})
		.from(trainingSessions)
		.where(
			and(eq(trainingSessions.studentId, studentId), eq(trainingSessions.loggedBy, professionalId))
		)
		.orderBy(desc(trainingSessions.sessionDate))
		.limit(limit);

	return rows.map((r) => {
		const ex = r.exercisesDone ?? [];
		return {
			id: r.id,
			date: new Date(r.sessionDate).toISOString(),
			label: r.sessionLabel,
			perceivedEffort: r.perceivedEffort,
			durationMinutes: r.durationMinutes,
			doneCount: ex.filter((e) => e.completed).length,
			totalCount: ex.length,
			observations: r.observations
		};
	});
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
		intensity_used?: number;
		completed?: boolean;
	}>;
};

export async function getRecentSessionLogs(
	planId: string,
	sessionLabel: string,
	limit = 5
): Promise<SessionLogEntry[]> {
	if (!isUuid(planId)) return [];
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
		// Heatmap: 26 semanas (182 dias) — count de sessões por dia.
		// Antes: generate_series(0,181) × subquery COUNT por dia = 182
		// subqueries por load do dashboard (lento). Agora: 1 GROUP BY que
		// retorna só os dias COM sessão (esparso); o array de 182 posições
		// é montado em JS preenchendo zeros.
		// Datas em America/Sao_Paulo (server = UTC): treino de 21h+ BRT caía
		// na célula do dia seguinte do heatmap.
		db.execute<{ day_offset: number; sessions_count: number }>(sql`
			SELECT
				((now() AT TIME ZONE 'America/Sao_Paulo')::date
					- (ts.session_date AT TIME ZONE 'America/Sao_Paulo')::date)::int AS day_offset,
				COUNT(*)::int AS sessions_count
			FROM training_sessions ts
			WHERE ts.logged_by = ${professionalId}
			  AND (ts.session_date AT TIME ZONE 'America/Sao_Paulo')::date
					> (now() AT TIME ZONE 'America/Sao_Paulo')::date - 182
			GROUP BY 1
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
	const stats = (
		statsRows as Array<{
			active_students: number;
			all_plans: number;
			active_plans: number;
			sessions_7: number;
			assessments_total: number;
		}>
	)[0];

	const heatmapRows =
		(heatmapResult as unknown as { rows?: typeof heatmapResult }).rows ?? heatmapResult;
	// 182 posições, cronológico (índice 0 = 181 dias atrás … 181 = hoje) —
	// mesma ordem que a query antiga (ORDER BY day_offset DESC) produzia.
	const heatmap = new Array<number>(182).fill(0);
	for (const r of heatmapRows as Array<{ day_offset: number; sessions_count: number }>) {
		const idx = 181 - Number(r.day_offset);
		if (idx >= 0 && idx < 182) heatmap[idx] = Number(r.sessions_count);
	}
	const heatmapMax = Math.max(...heatmap, 1);

	const upcomingRows =
		(upcomingResult as unknown as { rows?: typeof upcomingResult }).rows ?? upcomingResult;
	const upcomingAppointments = (
		upcomingRows as Array<{
			id: string;
			starts_at: Date | string;
			title: string | null;
			student_name: string | null;
		}>
	).map((r) => ({
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
	return r.rows ?? (result as T[]) ?? [];
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
	// Escapa curingas do ILIKE (\, % e _): sem isso buscar "%" devolvia o
	// catálogo inteiro e "_" casava qualquer caractere.
	const pat = q ? '%' + q.replace(/[\\%_]/g, '\\$&') + '%' : undefined;

	const conds = [sql`1=1`];
	if (opts.bodyPart) conds.push(sql`body_part = ${opts.bodyPart}`);
	if (opts.equipment) conds.push(sql`equipment = ${opts.equipment}`);
	if (opts.difficulty) conds.push(sql`difficulty = ${opts.difficulty}`);
	// unaccent (schema extensions): buscar "biceps"/"quadriceps" sem acento
	// acha "Bíceps"/"Quadríceps". Sem isso, o seed de grupo muscular sem acento
	// (ou o personal digitando sem acento) devolvia poucos ou zero resultados.
	if (pat)
		conds.push(
			sql`(extensions.unaccent(name) ILIKE extensions.unaccent(${pat}) OR extensions.unaccent(name_en) ILIKE extensions.unaccent(${pat}))`
		);
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
	if (!isUuid(id)) return null;
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

/* ────────── CRM / LEADS (admin interno do Preceptor Fisic) ────────── */

/**
 * Funil de aquisição. Estágios refletem a jornada visitante → usuário pagante.
 */
export type LeadStage =
	| 'visitante'
	| 'cadastrou'
	| 'ativou_aluno'
	| 'trial'
	| 'pagante'
	| 'cancelado'
	| 'perdido';

export type LeadSource = 'instagram' | 'indicacao' | 'anuncio' | 'site' | 'whatsapp' | 'outro';

export const LEAD_STAGES: { id: LeadStage; label: string; color: string }[] = [
	{ id: 'visitante', label: 'Visitante', color: 'var(--ink-2)' },
	{ id: 'cadastrou', label: 'Cadastrou', color: 'var(--info)' },
	{ id: 'ativou_aluno', label: 'Ativou aluno', color: 'var(--accent-2)' },
	{ id: 'trial', label: 'Trial', color: 'var(--warn)' },
	{ id: 'pagante', label: 'Pagante', color: 'var(--success)' },
	{ id: 'cancelado', label: 'Cancelado', color: 'var(--ink-3)' },
	{ id: 'perdido', label: 'Perdido', color: 'var(--danger)' }
];

export const LEAD_SOURCES: { id: LeadSource; label: string }[] = [
	{ id: 'instagram', label: 'Instagram' },
	{ id: 'indicacao', label: 'Indicação' },
	{ id: 'anuncio', label: 'Anúncio' },
	{ id: 'site', label: 'Site' },
	{ id: 'whatsapp', label: 'WhatsApp' },
	{ id: 'outro', label: 'Outro' }
];

export type LeadListItem = {
	id: string;
	name: string;
	phone: string | null;
	email: string | null;
	source: LeadSource;
	stage: LeadStage;
	notes: string | null;
	nextFollowUpAt: Date | null;
	subjectProfessionalId: string | null;
	lostReason: string | null;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Retorna TODOS os leads (admin-only — qualquer admin enxerga tudo).
 * Não há filtro por professionalId aqui propositalmente — leads são
 * compartilhados entre todos os admins do Preceptor Fisic.
 */
export async function getAllLeads(): Promise<LeadListItem[]> {
	const rows = await db.select().from(leads).orderBy(desc(leads.createdAt));
	return rows as LeadListItem[];
}

export async function getLeadById(id: string): Promise<LeadListItem | null> {
	if (!isUuid(id)) return null;
	const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
	return (row ?? null) as LeadListItem | null;
}

export async function createLead(data: {
	name: string;
	phone?: string | null;
	email?: string | null;
	source?: LeadSource;
	stage?: LeadStage;
	notes?: string | null;
	nextFollowUpAt?: Date | null;
	subjectProfessionalId?: string | null;
	professionalId?: string | null;
}): Promise<Lead> {
	const insert: NewLead = {
		professionalId: data.professionalId ?? null,
		subjectProfessionalId: data.subjectProfessionalId ?? null,
		name: data.name.trim(),
		phone: data.phone?.trim() || null,
		email: data.email?.trim() || null,
		source: data.source ?? 'outro',
		stage: data.stage ?? 'visitante',
		notes: data.notes?.trim() || null,
		nextFollowUpAt: data.nextFollowUpAt ?? null
	};
	const [row] = await db.insert(leads).values(insert).returning();
	if (!row) throw new Error('falha ao criar lead');
	return row;
}

export async function updateLead(
	id: string,
	data: Partial<{
		name: string;
		phone: string | null;
		email: string | null;
		source: LeadSource;
		stage: LeadStage;
		notes: string | null;
		nextFollowUpAt: Date | null;
		lostReason: string | null;
	}>
): Promise<Lead | null> {
	if (!isUuid(id)) return null;
	const [row] = await db
		.update(leads)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(leads.id, id))
		.returning();
	return row ?? null;
}

export async function updateLeadStage(id: string, stage: LeadStage): Promise<Lead | null> {
	return updateLead(id, { stage });
}

export async function deleteLead(id: string): Promise<boolean> {
	if (!isUuid(id)) return false;
	const res = await db.delete(leads).where(eq(leads.id, id)).returning({ id: leads.id });
	return res.length > 0;
}

/** Conta leads por stage — alimenta badges + funil */
export async function getLeadCountsByStage(): Promise<Record<LeadStage, number>> {
	const rows = await db.execute<{ stage: LeadStage; n: number }>(sql`
		SELECT stage::text AS stage, COUNT(*)::int AS n
		FROM leads
		GROUP BY stage
	`);
	const list = unwrapRows<{ stage: LeadStage; n: number }>(rows);
	const counts: Record<LeadStage, number> = {
		visitante: 0,
		cadastrou: 0,
		ativou_aluno: 0,
		trial: 0,
		pagante: 0,
		cancelado: 0,
		perdido: 0
	};
	for (const r of list) counts[r.stage] = Number(r.n);
	return counts;
}

/**
 * Auto-cria lead quando um professional faz signup. Idempotente: se já
 * existe lead pra esse professional, atualiza ao invés de duplicar.
 *
 * Chamado pelo onboarding e por hooks futuros (Stripe etc).
 */
export async function createLeadFromSignup(params: {
	professionalId: string;
	name: string;
	email: string;
	source?: LeadSource;
}): Promise<void> {
	const existing = await db
		.select({ id: leads.id })
		.from(leads)
		.where(eq(leads.subjectProfessionalId, params.professionalId))
		.limit(1);

	if (existing.length > 0) {
		// Atualiza o stage pra 'cadastrou' caso ainda esteja como 'visitante'
		await db
			.update(leads)
			.set({ stage: 'cadastrou', name: params.name, email: params.email, updatedAt: new Date() })
			.where(eq(leads.id, existing[0]!.id));
		return;
	}

	await db.insert(leads).values({
		subjectProfessionalId: params.professionalId,
		name: params.name,
		email: params.email,
		source: params.source ?? 'outro',
		stage: 'cadastrou'
	});
}

/**
 * Sincroniza o stage do lead com base no estado atual do professional.
 * Regras:
 * - subscription_status='active' → pagante
 * - subscription_status='trial' + has students → ativou_aluno (ou trial se sem alunos)
 * - subscription_status='cancelled' → cancelado
 *
 * Chamado por hooks (Stripe webhook, after-add-student, etc).
 */
export async function syncLeadStageFromProfessional(professionalId: string): Promise<void> {
	const result = await db.execute<{
		subscription_status: string;
		has_students: boolean;
	}>(sql`
		SELECT
			p.subscription_status::text AS subscription_status,
			EXISTS (
				SELECT 1 FROM students s
				WHERE s.professional_id = p.id AND s.deleted_at IS NULL
			) AS has_students
		FROM professionals p
		WHERE p.id = ${professionalId}
	`);
	const row = unwrapRows<{ subscription_status: string; has_students: boolean }>(result)[0];
	if (!row) return;

	let newStage: LeadStage = 'cadastrou';
	if (row.subscription_status === 'active' || row.subscription_status === 'paid') {
		newStage = 'pagante';
	} else if (row.subscription_status === 'cancelled' || row.subscription_status === 'canceled') {
		newStage = 'cancelado';
	} else if (row.subscription_status === 'trial') {
		newStage = row.has_students ? 'ativou_aluno' : 'trial';
	}

	await db
		.update(leads)
		.set({ stage: newStage, updatedAt: new Date() })
		.where(eq(leads.subjectProfessionalId, professionalId));
}

/* ────────── FEEDBACK (beta testers) ────────── */

export type FeedbackCategory = 'bug' | 'sugestao' | 'duvida' | 'elogio' | 'outro';

export type FeedbackItem = {
	id: string;
	authorName: string | null;
	authorEmail: string | null;
	category: FeedbackCategory;
	message: string;
	page: string | null;
	createdAt: Date;
};

export const FEEDBACK_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
	{ id: 'bug', label: 'Bug / erro' },
	{ id: 'sugestao', label: 'Sugestão' },
	{ id: 'duvida', label: 'Dúvida' },
	{ id: 'elogio', label: 'Elogio' },
	{ id: 'outro', label: 'Outro' }
];

export async function createFeedback(input: {
	professionalId: string;
	authorName?: string | null;
	authorEmail?: string | null;
	category: FeedbackCategory;
	message: string;
	page?: string | null;
}): Promise<void> {
	await db.insert(feedback).values({
		professionalId: isUuid(input.professionalId) ? input.professionalId : null,
		authorName: input.authorName ?? null,
		authorEmail: input.authorEmail ?? null,
		category: input.category,
		message: input.message,
		page: input.page ?? null
	});
}

const FEEDBACK_COLS = {
	id: feedback.id,
	authorName: feedback.authorName,
	authorEmail: feedback.authorEmail,
	category: feedback.category,
	message: feedback.message,
	page: feedback.page,
	createdAt: feedback.createdAt
} as const;

/** Feedback enviado pelo próprio profissional (beta tester). */
export async function getMyFeedback(professionalId: string): Promise<FeedbackItem[]> {
	if (!isUuid(professionalId)) return [];
	const rows = await db
		.select(FEEDBACK_COLS)
		.from(feedback)
		.where(eq(feedback.professionalId, professionalId))
		.orderBy(desc(feedback.createdAt));
	return rows as FeedbackItem[];
}

/** TODOS os feedbacks — só admin enxerga (filtragem no caller). */
export async function getAllFeedback(): Promise<FeedbackItem[]> {
	const rows = await db.select(FEEDBACK_COLS).from(feedback).orderBy(desc(feedback.createdAt));
	return rows as FeedbackItem[];
}

/**
 * Persiste o risco cardiovascular CONFIRMADO pelo profissional (fluxo
 * sugerir+confirmar da estratificação automática). Upsert: cria o perfil de
 * saúde mínimo se ainda não existir. Ver [[projeto-preceptor-fisic]].
 */
export async function setCardiovascularRisk(
	studentId: string,
	level: 'baixo' | 'moderado' | 'alto' | 'muito_alto'
): Promise<void> {
	if (!isUuid(studentId)) throw new Error('studentId inválido');
	await db
		.insert(healthProfiles)
		.values({ studentId, cardiovascularRisk: level })
		.onConflictDoUpdate({
			target: healthProfiles.studentId,
			set: { cardiovascularRisk: level, updatedAt: new Date() }
		});
}
