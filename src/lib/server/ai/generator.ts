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
import { and, eq, inArray } from 'drizzle-orm';
import { generateObject, streamObject } from 'ai';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { dev as isDev } from '$app/environment';
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
	exerciseCatalog,
	type Student,
	type HealthProfile,
	type Restriction,
	type MonitoringNote,
	type AssessmentProtocol,
	type ExerciseCatalogItem
} from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import { trainingPlanSchema, type TrainingPlanOutput } from '$lib/schemas/training-plan';
import { retrieveRelevantChunks, formatContextForPrompt } from './rag';
import { SYSTEM_PROMPT_PT_BR, SYSTEM_PROMPT_VERSION } from './system-prompt';
import {
	validatePlan,
	violationToRestriction,
	deriveStudentCtxFromHealth
} from '$lib/server/clinical/validator';

// Flash primário: 3x mais rápido que Pro, qualidade suficiente pro nosso schema.
// Pro só é tentado se Flash falhar (pouco comum).
const PRIMARY_MODEL = env.AI_MODEL_FAST ?? 'gemini-2.5-flash';
const FALLBACK_MODEL = env.AI_MODEL_PRIMARY ?? 'gemini-2.5-pro';

/** Teto da chamada de IA (ms). Fica ABAIXO do maxDuration da função (300s no
 * Pro) pra sobrar tempo de validar + persistir o plano (ou marcar failed).
 * 280s dá folga generosa pra IA fechar o plano completo num paciente
 * complexo. Em dev local (Node persistente) 120s basta. Se você estiver no
 * plano Hobby da Vercel (maxDuration 60), baixe via env AI_GEN_TIMEOUT_MS=56000. */
const AI_GEN_TIMEOUT_MS = Number(env.AI_GEN_TIMEOUT_MS ?? (isDev ? '120000' : '280000'));

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

/** Item compacto do catálogo passado pro prompt da IA. */
export type CatalogPromptItem = Pick<
	ExerciseCatalogItem,
	'externalId' | 'name' | 'nameEn' | 'equipment' | 'bodyPart' | 'targetMuscle' | 'difficulty'
>;

type StudentContext = {
	student: Student;
	health: HealthProfile | null;
	preferences: typeof trainingPreferences.$inferSelect | null;
	conditionTags: string[];
	/** Subset do exercise_catalog filtrado pelo equipamento do aluno. */
	catalog: CatalogPromptItem[];
};

/** Cap de itens enviados pro prompt — mantém o contexto enxuto. 150
 * itens ≈ 12KB de prompt, ~3k tokens. Mais que isso acelera o LLM mas
 * sobrecarrega o budget de 60s da função serverless (Hobby). */
const CATALOG_PROMPT_CAP = 100;
/** Defaults quando o aluno não tem equipamento registrado (cenário home). */
const DEFAULT_EQUIPMENT_FALLBACK = ['body weight', 'dumbbell', 'band'];

/**
 * Mapeia o nível de experiência do aluno (PT-BR, do schema da app) pras
 * difficulties do catálogo ExerciseDB Pro (EN). Iniciante NÃO vê nada
 * advanced; intermediário vê até intermediate; avançado pega todos.
 */
const EXPERIENCE_TO_DIFFICULTY: Record<string, Set<string>> = {
	iniciante: new Set(['beginner']),
	intermediario: new Set(['beginner', 'intermediate']),
	avancado: new Set(['beginner', 'intermediate', 'advanced'])
};

/**
 * Dificuldade-alvo prescrita pelo profissional → difficulties do catálogo.
 * Knob independente da experiência: deixa o treinador limitar a complexidade
 * técnica dos exercícios (ex: aluno novo na academia recebe só exercícios
 * simples, mesmo que seja experiente em treino).
 */
const PRESCRIBED_TO_DIFFICULTY: Record<string, Set<string>> = {
	pequena: new Set(['beginner']),
	media: new Set(['beginner', 'intermediate']),
	alta: new Set(['beginner', 'intermediate', 'advanced'])
};

/**
 * Filtra o catálogo por (1) equipamento disponível e (2) dificuldade
 * permitida. Sempre inclui body weight (universal). Casamento por substring
 * pra tolerar variações ("dumbbell" matchando "dumbbell (used as handles for
 * deeper range)"). Cap em CATALOG_PROMPT_CAP.
 *
 * Difficulty: aplica o MAIS restritivo entre o nível de experiência e a
 * dificuldade-alvo prescrita pelo treinador — filtra ANTES de enviar pro LLM,
 * então a IA nem vê exercícios acima do permitido.
 */
function filterCatalog(
	catalog: CatalogPromptItem[],
	studentEquipment: string[] | null | undefined,
	experienceLevel: string | null | undefined,
	prescribedDifficulty: string | null | undefined
): CatalogPromptItem[] {
	const studentEq = (studentEquipment ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
	const targetEq = studentEq.length > 0 ? studentEq : DEFAULT_EQUIPMENT_FALLBACK;

	// Interseção (mais restritivo) entre experiência e dificuldade prescrita.
	const byExperience = experienceLevel ? EXPERIENCE_TO_DIFFICULTY[experienceLevel] : null;
	const byPrescribed = prescribedDifficulty ? PRESCRIBED_TO_DIFFICULTY[prescribedDifficulty] : null;
	let allowedDiff: Set<string> | null = null;
	if (byExperience && byPrescribed) {
		allowedDiff = new Set([...byExperience].filter((d) => byPrescribed.has(d)));
	} else {
		allowedDiff = byExperience ?? byPrescribed ?? null;
	}
	const passesDifficulty = (d: string | null) =>
		!allowedDiff || !d || allowedDiff.has(d.toLowerCase());

	const exact: CatalogPromptItem[] = [];
	const bodyweight: CatalogPromptItem[] = [];
	for (const item of catalog) {
		if (!passesDifficulty(item.difficulty)) continue;
		const itemEq = (item.equipment ?? '').toLowerCase();
		if (!itemEq) continue;
		if (itemEq === 'body weight') {
			bodyweight.push(item);
			continue;
		}
		if (targetEq.some((s) => itemEq.includes(s) || s.includes(itemEq))) {
			exact.push(item);
		}
	}
	const out = [...exact, ...bodyweight];
	return out.length > CATALOG_PROMPT_CAP ? out.slice(0, CATALOG_PROMPT_CAP) : out;
}

async function fetchCatalogSubset(
	studentEquipment: string[] | null | undefined,
	experienceLevel: string | null | undefined,
	prescribedDifficulty: string | null | undefined
): Promise<CatalogPromptItem[]> {
	const all = await db
		.select({
			externalId: exerciseCatalog.externalId,
			name: exerciseCatalog.name,
			nameEn: exerciseCatalog.nameEn,
			equipment: exerciseCatalog.equipment,
			bodyPart: exerciseCatalog.bodyPart,
			targetMuscle: exerciseCatalog.targetMuscle,
			difficulty: exerciseCatalog.difficulty
		})
		.from(exerciseCatalog);
	return filterCatalog(all, studentEquipment, experienceLevel, prescribedDifficulty);
}

function formatCatalogForPrompt(items: CatalogPromptItem[]): string {
	if (items.length === 0) {
		return '(catálogo indisponível — gerar com exercícios livres, sem catalog_id)';
	}
	// Formato compacto: [id] nome (equip · grupo · nível)
	// O modelo precisa do nome PT pra raciocinar e do external_id pra
	// preencher catalog_id. Mantém uma única linha por item.
	return items
		.map((c) => {
			const meta = [c.equipment, c.bodyPart, c.difficulty].filter(Boolean).join(' · ');
			return `${c.externalId} — ${c.name}${meta ? ` (${meta})` : ''}`;
		})
		.join('\n');
}

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
		// Um label genérico "diabetes" casava nas DUAS regras → marcava o aluno
		// como tipo 1 E tipo 2 ao mesmo tempo (contraindicações conflitantes).
		// Agora: tipo só quando explícito; diabetes genérico → tipo 2 (~90% dos casos).
		if (/diabetes|diabet|\bdm\b|dm[12]|dm [12]/.test(label)) {
			const isDm1 = /dm1|dm 1|tipo 1|tipo i\b/.test(label);
			const isDm2 = /dm2|dm 2|tipo 2|tipo ii\b/.test(label);
			if (isDm1) tags.add('diabetes_tipo_1');
			if (isDm2 || !isDm1) tags.add('diabetes_tipo_2');
		}
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

/**
 * Padrões pra detectar, em texto livre da IA, menção a uma condição clínica.
 * Espelha os regex de deriveConditionTags. `family` é um substring estável da(s)
 * tag(s) correspondente(s) — usado pra checar se o aluno realmente tem a condição.
 *
 * Guard anti-alucinação (bug PreceptorFISIC): a IA gerava restrições de
 * cardiomiopatia isquêmica pra alunos sem essa condição. Aqui, qualquer
 * restriction/monitoring que cite uma condição cuja tag NÃO está no perfil é
 * descartada antes de persistir.
 */
const CONDITION_TEXT_PATTERNS: { re: RegExp; family: string }[] = [
	{ re: /hipertens|press[aã]o alta|\bhas\b/i, family: 'hipertensao' },
	{ re: /diabet|\bdm\b|\bdm[12]\b/i, family: 'diabetes' },
	{
		re: /cardiopat|cardiomiopat|coronar|\biam\b|infarto|isqu[eê]mi|\bdac\b/i,
		family: 'cardiopatia'
	},
	{ re: /insufici[eê]ncia card|\bicc\b/i, family: 'ic_' },
	{ re: /dpoc|enfisema|bronquite|pulmonar/i, family: 'dpoc' },
	{ re: /\bavc\b|acidente vascular/i, family: 'avc' },
	{ re: /parkinson/i, family: 'parkinson' },
	{ re: /esclerose m[uú]ltipla/i, family: 'esclerose' },
	{ re: /gestante|gr[aá]vida|gravidez/i, family: 'gestante' },
	{ re: /osteoartr|artrose/i, family: 'osteoartrite' },
	{ re: /dor lombar|lombalgia/i, family: 'lombar' },
	{ re: /obesidade/i, family: 'obesidade' },
	{ re: /c[aâ]ncer|oncolog|quimioterap/i, family: 'cancer' },
	{ re: /dislipidemia|colesterol/i, family: 'dislipidemia' },
	{ re: /sarcopenia|fr[aá]gil/i, family: 'fragil' },
	{ re: /\blca\b|ligamento cruzado/i, family: 'lca' }
];

/**
 * Retorna o nome da primeira condição "órfã" citada no texto (presente no texto
 * mas SEM tag correspondente no perfil do aluno), ou null se tudo confere.
 */
function mentionsAbsentCondition(text: string, conditionTags: string[]): string | null {
	if (!text) return null;
	for (const { re, family } of CONDITION_TEXT_PATTERNS) {
		if (re.test(text)) {
			const present = conditionTags.some((t) => t.includes(family));
			if (!present) return family;
		}
	}
	return null;
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

	const catalog = await fetchCatalogSubset(
		(preferences?.equipmentAvailable as string[] | null) ?? null,
		preferences?.experienceLevel ?? null,
		preferences?.prescribedDifficulty ?? null
	);

	return {
		student,
		health: health ?? null,
		preferences: preferences ?? null,
		conditionTags: deriveConditionTags(health ?? null),
		catalog
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
			lines.push(
				`- ${m.name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` · ${m.frequency}` : ''}`
			);
		}
	} else {
		lines.push('- (sem medicamentos em uso)');
	}
	lines.push('');
	// Limitações físicas / lesões (campo "limitations" do form → injuries jsonb).
	// Crítico pra IA evitar movimentos que afetam regiões comprometidas.
	const inj = (h?.injuries as Array<{ region: string; notes?: string }> | null) ?? [];
	lines.push('## LIMITAÇÕES FÍSICAS / LESÕES (EVITAR exercícios que estressem essas regiões)');
	if (inj.length > 0) {
		for (const i of inj) {
			lines.push(`- ${i.region}${i.notes ? ` — ${i.notes}` : ''}`);
		}
	} else {
		lines.push('- (nenhuma limitação reportada)');
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
		// Lembrete de volume semanal por grupamento — amarra o nível do aluno à
		// faixa definida em "== VOLUME SEMANAL POR GRUPAMENTO MUSCULAR ==" do
		// system prompt, somando as séries de todas as sessões da semana.
		const volumeGuide: Record<string, string> = {
			iniciante:
				'INICIANTE → volume semanal por grupamento (somando todas as sessões): GRANDES 6–10 séries, PEQUENOS 4–8 séries. Comece no piso da faixa.',
			intermediario:
				'INTERMEDIÁRIO → volume semanal por grupamento (somando todas as sessões): GRANDES 10–16 séries, PEQUENOS 8–12 séries.',
			avancado:
				'AVANÇADO → volume semanal por grupamento (somando todas as sessões): GRANDES 14–24 séries, PEQUENOS 10–18 séries.'
		};
		const lvl = p.experienceLevel ?? 'iniciante';
		lines.push(
			`- Volume-alvo: ${volumeGuide[lvl] ?? volumeGuide.iniciante} Distribua em 2–3 estímulos semanais por grupamento; não exceda o teto da faixa.`
		);
		const difficultyGuide: Record<string, string> = {
			pequena:
				'PEQUENA — priorizar exercícios de baixa complexidade técnica (máquinas guiadas, peso do corpo, movimentos uni-articulares simples), baixo risco de lesão e fácil execução. Evitar exercícios técnicos como agachamento livre, levantamento terra, arranco, ou movimentos olímpicos.',
			media:
				'MÉDIA — mix equilibrado: incluir alguns exercícios livres e multi-articulares com progressão moderada, mas sem variações muito avançadas.',
			alta: 'ALTA — pode prescrever exercícios complexos e desafiadores (peso livre, multi-articulares, variações avançadas, unilaterais instáveis) compatíveis com as restrições clínicas.'
		};
		const diff = p.prescribedDifficulty ?? 'media';
		lines.push(
			`- Dificuldade-alvo dos exercícios: ${difficultyGuide[diff] ?? difficultyGuide.media}`
		);
		// Estrutura semanal — knob do profissional pra forçar divisão. "auto"
		// deixa a IA decidir com base em frequência (regra abaixo).
		const splitGuide: Record<string, string> = {
			auto: `AUTOMÁTICA — escolha a divisão pela frequência: 1-3x/sem → FULL-BODY (todos os grupos em toda sessão); 4x → UPPER/LOWER (alterna superior e inferior); 5-6x → PUSH/PULL/LEGS.`,
			full_body:
				'FULL-BODY — cada sessão deve cobrir todos os grandes grupos (peito, costas, pernas, ombros, core). Não criar sessões "só de braço" ou "só de perna".',
			upper_lower:
				'UPPER/LOWER — alternar estritamente: sessões ímpares (1ª, 3ª…) = upper (peito, costas, ombros, braços, core superior); pares = lower (quadríceps, posteriores, glúteos, panturrilha, core inferior).',
			push_pull_legs:
				'PUSH/PULL/LEGS — sessão 1 = push (peito, ombros, tríceps); sessão 2 = pull (costas, bíceps, posteriores de braço); sessão 3 = legs (todas as pernas + glúteos). Pra 4+ sessões, repetir o ciclo.'
		};
		const split = p.trainingSplit ?? 'auto';
		lines.push(`- Estrutura do treino: ${splitGuide[split] ?? splitGuide.auto}`);
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
	lines.push(`## CATÁLOGO DE EXERCÍCIOS DISPONÍVEIS (${ctx.catalog.length} itens)`);
	lines.push(
		'Cada linha: `external_id — nome (equipamento · grupo muscular · nível)`. Esses exercícios têm vídeo demonstrativo e instruções traduzidas no app do aluno.'
	);
	lines.push('');
	lines.push(formatCatalogForPrompt(ctx.catalog));
	lines.push('');
	lines.push('## TAREFA');
	lines.push('Gere um plano de treino semanal estruturado conforme o schema. Regras:');
	lines.push(
		'1. PREFERIR exercícios do CATÁLOGO acima sempre que possível — quando usar um, preencha `catalog_id` da exercise com o external_id (formato 4-5 dígitos, ex: "0001"). Mira em ≥80% dos exercícios do bloco principal vindos do catálogo. Para aquecimento/desaquecimento, pode usar exercícios livres se necessário.'
	);
	lines.push(
		'2. Para cada recomendação crítica, cite chunk_id do CONTEXTO CLÍNICO acima — preferindo chunks ACSM quando disponíveis. Se não estiver coberto, marque source.type = "inference".'
	);
	lines.push(
		'3. Quando escolher do catálogo, use o nome EXATO do catálogo no campo `name` (não invente variações), e copie o external_id PRECISO em `catalog_id`.'
	);
	// Sugestão de distribuição semanal — spreading com pelo menos 1 dia de
	// descanso entre treinos quando possível. Mesma tabela pra todos os
	// splits (full-body/upper-lower/PPL). LLM pode desviar se for clínicamente
	// melhor, mas o default cobre 95% dos casos.
	// Honra a frequência real do aluno (até 7x — preferências validam 1–7).
	// Antes o cap era 5: quem pedia 6–7 recebia só 5 sessões e a aderência
	// (sessions7 / weeklySessions) ficava distorcida.
	const N = Math.max(1, Math.min(7, ctx.preferences?.weeklySessions ?? 3));
	const DAY_DIST: Record<number, string[]> = {
		1: ['seg'],
		2: ['seg', 'qui'],
		3: ['seg', 'qua', 'sex'],
		4: ['seg', 'ter', 'qui', 'sex'],
		5: ['seg', 'ter', 'qua', 'qui', 'sex'],
		6: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
		7: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
	};
	const suggestedDays = DAY_DIST[N]?.join(', ') ?? 'seg, qua, sex';
	lines.push(
		`4. SESSÕES SEMANAIS: gere EXATAMENTE ${N} sessões — esse é o número que o aluno definiu na frequência alvo dele. OBRIGATÓRIO preencher \`day_of_week\` de CADA sessão (valores válidos: "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"). Distribua os treinos pela semana com descanso entre eles — sugestão de distribuição pra ${N} sessões: ${suggestedDays}. CONCISÃO EXTREMA (o tempo de geração é limitado): \`execution_notes\` = UMA frase de no máximo 12 palavras; \`summary\` = 2-3 frases; \`progression_strategy\` = 3-4 frases; monitoring_parameters: no máximo 3 itens; assessment_protocols: no máximo 2; restrictions: só red flag real; warmup: no máximo 2 exercícios; cooldown: no máximo 1.`
	);
	lines.push(
		'5. RESPEITE a Dificuldade-alvo dos exercícios definida nas PREFERÊNCIAS. A escolha dos exercícios deve refletir esse nível de complexidade técnica, independente do nível de experiência informado.'
	);
	lines.push(
		'6. FICHA DE PRESCRIÇÃO — para CADA exercício de força (warmup e main), preencha SEMPRE estes campos curtos, no padrão de prescrição brasileiro: `intensity` = % de 1RM no formato "% 1RM" (ex: "80% 1RM", "60-80% 1RM"; em peso corporal/isometria pode omitir); `load_guidance` = PSE (Percepção Subjetiva de Esforço) no formato "PSE x-y" (ex: "PSE 6-7") — NUNCA escreva "RPE". `intensity` (% 1RM) e `load_guidance` (PSE) são complementares e aparecem lado a lado na ficha. `muscle_action` = um de "isotonica" | "isometrica" | "auxotonico" | "isocinetica" (isométrica p/ pranchas/isometrias); `cadence` = tempo de execução no formato fase/fase (ex: "2/2", "1/3"); `range_of_motion` = amplitude (ex: "90°", "Full", "90° de flexão do cotovelo"); `rest_label` = pausa em texto (ex: "1min", "40s", "40s/1min"). Mantenha também `sets`, `reps`, `rest_seconds` numéricos. Use `series_label` SÓ quando as séries forem um esquema (ex: "2/2").'
	);
	lines.push(
		'7. AERÓBIO — se o aluno tiver objetivo cardiovascular/emagrecimento ou modalidade aeróbia, gere `aerobic_prescriptions` (1 a 3 itens) no formato do modelo: `means` (ex: "Esteira", "Corrida na Rua"), `weekly_frequency` (ex: "2x semana"), `method` (ex: "Contínuo"), `pause` (ex: "-"), `intensity` (ex: "60-70%Fcmáx (150-167bpm)"), `volume` (ex: "50min"). Caso contrário, deixe a lista vazia.'
	);
	lines.push(
		'8. CAPA — preencha `objective` com o objetivo do programa em 1-2 frases (ex: recomposição corporal, hipertrofia, condicionamento), e `program_weeks` com a duração total estimada do programa em semanas (tipicamente 8 a 16). Para cada sessão de força, preencha `observations` quando houver orientação geral (ex: "Executar os movimentos até 1-2 repetições de reserva.").'
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
				progressPhase: 'gerando plano com PreceptorFISIC'
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
			/** Última partial structured emitida — usada como salvamento
			 *  se o stream abortar antes de terminar. */
			let lastPartial: unknown = null;

			// Timer de progresso — garante movimento visual mesmo se o
			// partialObjectStream do Gemini não emitir incrementalmente
			// (caso comum: o modelo entrega tudo de uma vez no fim).
			// Aproxima de 88 de forma assintótica (ease-out): avança rápido no
			// começo e vai diminuindo o passo, então a barra NUNCA parece travada
			// mesmo numa geração longa (Pro pode levar minutos). Cap em 88 pra os
			// passos pós-geração (91/95/100) sempre irem pra frente.
			let simulatedPct = 55;
			const progressTimer = setInterval(() => {
				const step = Math.max(1, Math.round((88 - simulatedPct) / 10));
				simulatedPct = Math.min(88, simulatedPct + step);
				db.update(trainingPlans)
					.set({ progressPct: simulatedPct, updatedAt: new Date() })
					.where(eq(trainingPlans.id, planId))
					.catch(() => {});
			}, 4000);

			// Texto bruto acumulado do stream (alimenta UI "Gemini escrevendo").
			// Truncado em sliding window pra não bloar o DB row.
			let accumulatedText = '';
			let lastTextWrite = 0;

			try {
				const result = streamObject({
					model: google(model),
					schema: trainingPlanSchema,
					schemaName: 'TrainingPlan',
					schemaDescription:
						'Plano de treino clínico com sessões semanais, monitoramento, restrições e citações',
					system: SYSTEM_PROMPT_PT_BR,
					prompt: userPrompt,
					maxRetries: 1,
					// Aborta o stream antes do maxDuration da função pra sobrar
					// tempo do catch persistir status=failed. Sem isso a função
					// é morta pelo runtime e o plano fica em "generating" pra sempre.
					abortSignal: AbortSignal.timeout(AI_GEN_TIMEOUT_MS)
				});

				// fullStream emite eventos token-por-token (text-delta) +
				// object-parsed-throttled (object). Consumindo ambos num loop
				// só nos dá: texto raw streaming + structured partial. UI mostra
				// o texto chegando estilo ChatGPT enquanto a estrutura também
				// vai materializando.
				for await (const event of result.fullStream) {
					const now = Date.now();

					if (event.type === 'text-delta') {
						accumulatedText += (event as { textDelta?: string }).textDelta ?? '';
						// Throttle write a cada 1500ms. Cada write é round-trip
						// Postgres (~80ms). Em 180ms o overhead acumulado consumia
						// >20s da função em runs longos — não cabia no maxDuration.
						if (now - lastTextWrite < 1500) continue;
						lastTextWrite = now;
						// Mantém só últimos ~6KB (suficiente pra encher viewport
						// com texto mono) — evita row gigante no DB
						const slice = accumulatedText.slice(-6000);
						await db
							.update(trainingPlans)
							.set({ streamText: slice, updatedAt: new Date() })
							.where(eq(trainingPlans.id, planId))
							.catch(() => {});
					} else if (event.type === 'object') {
						// Salva antes do throttle — partial mais recente sempre
						// disponível pra fallback se abortar.
						lastPartial = event.object;
						const sessions =
							(event.object as { weekly_sessions?: unknown[] }).weekly_sessions ?? [];
						const sessionsCount = Array.isArray(sessions) ? sessions.length : 0;

						// Throttle 1500ms OU quando nova sessão completa. Cada write é
						// um round-trip Postgres (~80ms gru1↔Supabase); throttle apertado
						// somava ~5s de overhead na função, que tem só 60s no Hobby.
						if (now - lastWriteAt < 1500 && sessionsCount === lastSessionsCount) continue;
						lastWriteAt = now;
						lastSessionsCount = sessionsCount;

						const targetSessions = 3;
						const phase =
							sessionsCount === 0
								? 'estruturando plano clínico'
								: sessionsCount < targetSessions
									? `bloco ${sessionsCount} de ${targetSessions}: compondo exercícios`
									: 'finalizando monitoramento e restrições';

						await db
							.update(trainingPlans)
							.set({
								progressPhase: phase,
								planData: event.object as TrainingPlanOutput,
								updatedAt: new Date()
							})
							.where(eq(trainingPlans.id, planId))
							.catch(() => {});
					}
				}

				// Flush final do texto acumulado (último chunk pode ter ficado
				// abaixo do throttle de 180ms)
				if (accumulatedText) {
					await db
						.update(trainingPlans)
						.set({ streamText: accumulatedText.slice(-6000), updatedAt: new Date() })
						.where(eq(trainingPlans.id, planId))
						.catch(() => {});
				}

				return { object: await result.object, usage: await result.usage };
			} catch (streamErr) {
				// Salvamento: tenta aproveitar o último partial SEMPRE que existir
				// — não só em timeout/abort. Dois cenários levam aqui:
				//   1) abort do nosso timeout (corta no meio de uma sessão);
				//   2) o objeto FINAL falhou a validação do schema (ex.: última
				//      sessão incompleta, um campo curto demais).
				// Em ambos, o partial truncado costuma validar. Antes, só (1)
				// era tratado — (2) ia direto pra "Geração falhou" mesmo tendo
				// um plano quase pronto e válido em mãos.
				const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
				if (lastPartial) {
					// O corte quase sempre deixa a ÚLTIMA sessão com exercício
					// incompleto e o schema rejeita o plano inteiro. Tenta validar
					// versões truncadas: completo, depois sem a última sessão,
					// depois sem as 2 últimas... Plano com 2 de 3 sessões é muito
					// melhor que "failed" na cara do user.
					const base = lastPartial as Record<string, unknown>;
					const sessions = Array.isArray(base.weekly_sessions) ? base.weekly_sessions : [];
					for (let keep = sessions.length; keep >= 1; keep--) {
						const candidate = {
							...base,
							weekly_sessions: sessions.slice(0, keep),
							monitoring_parameters: Array.isArray(base.monitoring_parameters)
								? base.monitoring_parameters
								: [],
							assessment_protocols: Array.isArray(base.assessment_protocols)
								? base.assessment_protocols
								: [],
							restrictions: Array.isArray(base.restrictions) ? base.restrictions : [],
							aerobic_prescriptions: Array.isArray(base.aerobic_prescriptions)
								? base.aerobic_prescriptions
								: []
						};
						const parsed = trainingPlanSchema.safeParse(candidate);
						if (parsed.success) {
							log.warn(
								{ kept: keep, of: sessions.length, reason: msg.slice(0, 120) },
								'plan.generate.salvaged_partial'
							);
							return { object: parsed.data, usage: undefined };
						}
					}
					log.warn({ msg: msg.slice(0, 150) }, 'plan.generate.salvage_failed_partial_invalid');
				}
				throw streamErr;
			} finally {
				clearInterval(progressTimer);
			}
		};

		try {
			const r = await streamPlan(PRIMARY_MODEL);
			plan = r.object;
			usage = r.usage;
		} catch (primaryErr) {
			if (!isQuotaError(primaryErr)) throw primaryErr;
			log.warn({ err: String(primaryErr).slice(0, 200) }, 'plan.generate.primary_quota_fallback');
			await db
				.update(trainingPlans)
				.set({
					progressPhase: 'PreceptorFISIC saturado — tentando rota alternativa'
				})
				.where(eq(trainingPlans.id, planId));
			// Fallback NÃO streaming pra simplicidade — Pro raramente é tocado.
			// 120s: o erro de quota geralmente vem cedo, então sobra tempo no
			// maxDuration (300s) pro Pro gerar o plano completo e ainda validar.
			const fallbackGen = await generateObject({
				model: google(FALLBACK_MODEL),
				schema: trainingPlanSchema,
				schemaName: 'TrainingPlan',
				schemaDescription:
					'Plano de treino clínico com sessões semanais, monitoramento, restrições e citações',
				system: SYSTEM_PROMPT_PT_BR,
				prompt: userPrompt,
				maxRetries: 1,
				abortSignal: AbortSignal.timeout(120_000)
			});
			plan = fallbackGen.object;
			usage = fallbackGen.usage;
			modelUsed = FALLBACK_MODEL;
		}
		const genElapsed = Date.now() - genStartMs;

		await db
			.update(trainingPlans)
			.set({ progressPct: 91, progressPhase: 'validando e persistindo' })
			.where(eq(trainingPlans.id, planId));

		// Guard anti-alucinação clínica. Dois filtros sobre as restrições da IA:
		//   1) source.type='rule' é reservado ao engine de validação — a IA não
		//      pode emitir; quando emite, está forjando autoridade (vetor do bug).
		//   2) restrição que cita uma condição cuja tag NÃO está no perfil do aluno
		//      é alucinação (ex.: cardiomiopatia isquêmica num aluno sem cardiopatia).
		//      Greens (alinhamento com diretriz) passam — não imputam doença.
		const droppedRestrictions: string[] = [];
		const aiRestrictions: Restriction[] = plan.restrictions
			.filter((r) => {
				if (r.source.type === 'rule') {
					droppedRestrictions.push(`${r.title} [source.type=rule forjado]`);
					return false;
				}
				if (r.level !== 'green') {
					const orphan = mentionsAbsentCondition(`${r.title} ${r.description}`, ctx.conditionTags);
					if (orphan) {
						droppedRestrictions.push(`${r.title} [condição ausente: ${orphan}]`);
						return false;
					}
				}
				return true;
			})
			.map((r) => ({
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
		if (droppedRestrictions.length > 0) {
			log.warn(
				{ dropped: droppedRestrictions, condition_tags: ctx.conditionTags },
				'plan.guard.dropped_hallucinated_restrictions'
			);
		}

		// Validação clínica via clinical_rules engine
		await db
			.update(trainingPlans)
			.set({ progressPct: 95, progressPhase: 'validando contra clinical_rules' })
			.where(eq(trainingPlans.id, planId));

		const age = ctx.student.birthDate
			? Math.floor(
					(Date.now() - new Date(ctx.student.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
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
		// Mesmo guard nos monitoring_parameters — descarta monitoramento de
		// patologia que o aluno não tem (ex.: "FC contínua por cardiopatia").
		const monitoringNotes: MonitoringNote[] = plan.monitoring_parameters
			.filter((m) => {
				const orphan = mentionsAbsentCondition(
					`${m.parameter} ${m.frequency} ${m.alert_threshold ?? ''}`,
					ctx.conditionTags
				);
				if (orphan) {
					log.warn(
						{ parameter: m.parameter, condition: orphan, condition_tags: ctx.conditionTags },
						'plan.guard.dropped_hallucinated_monitoring'
					);
					return false;
				}
				return true;
			})
			.map((m) => ({
				parameter: m.parameter,
				frequency: m.frequency,
				alert_threshold: m.alert_threshold,
				source_refs: m.source_refs
					.map((s) => s.chunk_id ?? s.source_id ?? s.note ?? '')
					.filter(Boolean)
			}));
		const assessmentProtocols: AssessmentProtocol[] = plan.assessment_protocols.map((a) => ({
			test_name: a.test_name,
			when: a.when,
			source_refs: a.source_refs
				.map((s) => s.chunk_id ?? s.source_id ?? s.note ?? '')
				.filter(Boolean)
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
				}).catch((err) => log.error({ err: String(err).slice(0, 200) }, 'plan.ready.email.failed'));
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
/**
 * Janela após a qual um plano ainda em pending/generating é considerado
 * "preso" — a função serverless morreu (timeout, deploy, OOM) antes de
 * persistir o estado terminal. Com maxDuration=60s, qualquer plano nesse
 * estado por mais de 3 min é defesa-em-profundidade contra spinner
 * infinito.
 */
const STALE_PLAN_MS = 3 * 60 * 1000;

export type StalePlanInput = {
	id: string;
	status: string;
	updatedAt: Date | string | null;
};

/**
 * Watchdog: idempotente. Se o plano está pending/generating mas parado
 * há mais de STALE_PLAN_MS, marca como failed. O WHERE só atualiza se o
 * status ainda for pending/generating — evita corrida com uma geração
 * que acabou de concluir e o cliente leu cache antigo. Retorna o novo
 * estado se reconciliou, senão null.
 */
export async function failIfStale(
	plan: StalePlanInput
): Promise<{ status: 'failed'; errorMessage: string } | null> {
	if (plan.status !== 'pending' && plan.status !== 'generating') return null;
	const updatedMs = plan.updatedAt ? new Date(plan.updatedAt).getTime() : 0;
	if (Date.now() - updatedMs < STALE_PLAN_MS) return null;

	const errorMessage = 'Geração interrompida — tempo limite excedido. Tente gerar novamente.';
	await db
		.update(trainingPlans)
		.set({
			status: 'failed',
			progressPct: 0,
			progressPhase: 'erro',
			errorMessage,
			updatedAt: new Date()
		})
		.where(
			and(eq(trainingPlans.id, plan.id), inArray(trainingPlans.status, ['pending', 'generating']))
		);
	logger.warn({ planId: plan.id }, 'plan.stale.reconciled');
	return { status: 'failed', errorMessage };
}

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
