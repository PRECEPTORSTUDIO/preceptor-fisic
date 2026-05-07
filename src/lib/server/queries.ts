/**
 * Queries Drizzle centralizadas — toda interação com DB passa por aqui.
 * Filtragem por professional_id é responsabilidade dos callers (RLS também garante).
 */
import { eq, and, desc, asc, isNull, sql, count, gte, lte } from 'drizzle-orm';
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
			) AS last_session
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
			streak: 0, // TODO: calc real streak
			status
		};
	});
}

export type StudentDetail = {
	student: Student;
	healthProfile: HealthProfile | null;
	preferences: typeof trainingPreferences.$inferSelect | null;
	plans: { id: string; title: string; isActive: boolean; createdAt: Date; sessionsTotal: number }[];
	assessments: typeof physicalAssessments.$inferSelect[];
	lastWeights: number[];
};

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

	// Histórico de peso recente — últimas 8 medidas via progress_records, fallback pra peso atual
	const weightRows = await db
		.select({ value: progressRecords.value })
		.from(progressRecords)
		.where(and(eq(progressRecords.studentId, studentId), eq(progressRecords.metricType, 'weight')))
		.orderBy(desc(progressRecords.recordedAt))
		.limit(8);
	const lastWeights = weightRows.length ? weightRows.map((r) => r.value).reverse() : student.weightKg ? Array(8).fill(student.weightKg) : [];

	return { student, healthProfile: hp ?? null, preferences: prefs ?? null, plans, assessments, lastWeights };
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
	source?: { type: string; rule_code?: string; chunk_id?: string };
};

export type PlanExercise = {
	name: string;
	reps?: string;
	sets?: number;
	rest_seconds?: number;
	load_guidance?: string;
	muscle_groups?: string[];
	execution_notes?: string;
	contraindications?: string[];
	source_refs?: { type: string; note?: string; chunk_id?: string }[];
};

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
};

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
	return {
		id: r.id,
		studentName: r.studentName ?? '—',
		studentId: r.studentId,
		status: r.status,
		isActive: r.status === 'published' || r.status === 'generated',
		createdAt: r.createdAt,
		publishedAt: r.publishedAt,
		planData: (r.planData as PlanData) ?? {}
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

/* ────────── DASHBOARD STATS ────────── */

export async function getDashboardStats(professionalId: string) {
	// Tudo em 1 query — antes eram 5 round-trips sequenciais (~250ms).
	// Postgres consegue agregar tudo num scan eficiente (~30ms).
	const result = await db.execute<{
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
	`);

	const list = (result as unknown as { rows?: typeof result }).rows ?? result;
	const row = (list as Array<{
		active_students: number;
		all_plans: number;
		active_plans: number;
		sessions_7: number;
		assessments_total: number;
	}>)[0];

	return {
		activeStudents: Number(row?.active_students ?? 0),
		totalStudents: Number(row?.active_students ?? 0),
		totalPlans: Number(row?.all_plans ?? 0),
		activePlans: Number(row?.active_plans ?? 0),
		sessionsThisWeek: Number(row?.sessions_7 ?? 0),
		assessmentsLogged: Number(row?.assessments_total ?? 0)
	};
}
