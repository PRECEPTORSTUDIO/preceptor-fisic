/**
 * Classificação de carga por tipo de exercício + cálculo de tonelagem.
 *
 * UI (treino detail) usa pra decidir qual input pedir ao aluno; relatório
 * (#8 carga externa × interna) usa pra agregar volume semanal.
 *
 * 3 tipos:
 *  - `weight`     — exercício com carga externa (halter, barra, máquina).
 *                   Aluno informa `kg`. Tonelagem = kg × reps × sets.
 *  - `bodyweight` — peso do próprio corpo (flexão, agachamento livre).
 *                   Sem input de carga. Tonelagem = bodyweight_kg × reps × sets × 0.65
 *                   (fator de Brzycki simplificado pra calistenia — calistenia carrega
 *                   ~65% do peso corporal em média no movimento composto).
 *  - `time`       — isometria ou cardio (prancha, caminhada, bicicleta).
 *                   Aluno informa `segundos`. "Tonelagem" não se aplica;
 *                   a métrica é sRPE = duração_min × RPE.
 */
export type ExerciseKind = 'weight' | 'bodyweight' | 'time';

const TIME_REGEX = /\b(prancha|isometr|isometric|plank|caminha|caminhad|corrida|bicicleta|el[íi]ptic|ergom[ée]tr|esteira|step ?mill|skierg|ski erg|cardio|aer[óo]bic|jumping ?jack|polichinelo)\b/i;
const BODYWEIGHT_EQUIP_REGEX = /^body ?weight$/i;
const BODYWEIGHT_NAME_REGEX = /\b(flex[ãa]o de bra[çc]o|push.?up|burpee|prancha|abdominal|sit.?up|barra fixa|pull.?up|chin.?up|mergulho|dip|salto|jumping ?jack|polichinelo|agachamento livre sem|airSquat|air ?squat|crunch)\b/i;

export type ClassifyInput = {
	name?: string | null;
	equipment?: string | null;
	muscle_groups?: string[] | null;
	body_part?: string | null;
};

export function classifyExercise(ex: ClassifyInput): ExerciseKind {
	const name = (ex.name ?? '').toLowerCase();
	const eq = (ex.equipment ?? '').toLowerCase();
	const bp = (ex.body_part ?? '').toLowerCase();

	// 1) Tempo manda — cobre cardio + isometria mesmo se for body weight
	if (TIME_REGEX.test(name) || bp === 'cardio') return 'time';

	// 2) Body weight (equipamento explícito do catálogo)
	if (BODYWEIGHT_EQUIP_REGEX.test(eq)) return 'bodyweight';

	// 3) Heurística por nome (catálogo livre sem equipment certo)
	if (BODYWEIGHT_NAME_REGEX.test(name)) return 'bodyweight';

	// 4) Default: carga externa
	return 'weight';
}

/**
 * Tonelagem por série em kg. Pra `weight` precisa do kg informado;
 * pra `bodyweight` precisa do peso corporal; pra `time` retorna 0 (não
 * aplicável — use {@link sRPE} no lugar).
 */
export function tonnagePerSet(args: {
	kind: ExerciseKind;
	reps: number;
	loadKg?: number | null;
	bodyweightKg?: number | null;
}): number {
	if (args.kind === 'weight') return (args.loadKg ?? 0) * args.reps;
	if (args.kind === 'bodyweight') return (args.bodyweightKg ?? 0) * args.reps * 0.65;
	return 0;
}

/**
 * sRPE (session-RPE de Foster) por exercício. Unidade: AU (arbitrary units).
 * Padrão sports science: minutos × RPE (escala 0-10). Boa proxy de carga
 * interna pra cardio + isometria, e somatório útil pra carga total.
 */
export function sRPE(args: { durationMinutes: number; rpe: number }): number {
	return Math.max(0, args.durationMinutes) * Math.max(0, Math.min(10, args.rpe));
}

/** Helper de UI: texto curto descrevendo o input esperado pra cada tipo. */
export function loadInputHint(kind: ExerciseKind): {
	placeholder: string;
	unit: string;
	help: string;
} {
	switch (kind) {
		case 'weight':
			return { placeholder: '60', unit: 'kg', help: 'Carga usada por série (kg)' };
		case 'bodyweight':
			return {
				placeholder: '—',
				unit: '',
				help: 'Peso corporal — registra reps + PSE. Tonelagem estimada via peso do aluno.'
			};
		case 'time':
			return { placeholder: '45', unit: 's', help: 'Duração por série (segundos)' };
	}
}
