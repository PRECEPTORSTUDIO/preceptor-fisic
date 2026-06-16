/**
 * Métricas de treino derivadas — funções puras, sem DB.
 * Usadas no UI pra sinalizar risco (carga interna×externa) e volume por
 * grupo muscular.
 */

/* ────────── ACWR — Acute:Chronic Workload Ratio ────────── */

export type AcwrLevel = 'sem_dados' | 'baixa' | 'otima' | 'atencao' | 'alto_risco';

export type AcwrResult = {
	/** Carga interna (sRPE) da semana mais recente. */
	acute: number;
	/** Média das últimas 4 semanas (carga crônica). */
	chronic: number;
	/** acute / chronic. null se não há base crônica suficiente. */
	ratio: number | null;
	level: AcwrLevel;
	label: string;
	/** Texto curto explicando o que fazer. */
	hint: string;
};

const ACWR_LABEL: Record<AcwrLevel, { label: string; hint: string }> = {
	sem_dados: { label: 'Sem dados', hint: 'Registre mais sessões pra calcular o risco.' },
	baixa: { label: 'Subcarga', hint: 'Carga abaixo do habitual — pode progredir com segurança.' },
	otima: { label: 'Zona ideal', hint: 'Progressão de carga dentro da faixa segura.' },
	atencao: { label: 'Atenção', hint: 'Carga subindo rápido — monitore sinais de fadiga.' },
	alto_risco: { label: 'Alto risco', hint: 'Pico de carga — risco de lesão elevado. Reduza o volume.' }
};

/**
 * ACWR clássico: carga aguda (semana atual) ÷ carga crônica (média das
 * últimas 4 semanas). Faixas de referência (Gabbett): <0.8 subcarga,
 * 0.8–1.3 ideal, 1.3–1.5 atenção, >1.5 alto risco de lesão.
 *
 * Recebe as semanas em ordem cronológica (mais antiga → mais nova), como
 * `getStudentLoadEvolution` devolve.
 */
export function computeAcwr(weeks: { internalLoad: number }[]): AcwrResult {
	const loads = weeks.map((w) => w.internalLoad ?? 0);
	const acute = loads.length > 0 ? (loads[loads.length - 1] ?? 0) : 0;
	// Crônica = média das últimas 4 semanas (inclui a atual). Precisa de pelo
	// menos 2 semanas com carga pra fazer sentido.
	const last4 = loads.slice(-4);
	const nonZero = last4.filter((l) => l > 0);
	const chronic = last4.length > 0 ? last4.reduce((s, l) => s + l, 0) / last4.length : 0;

	let level: AcwrLevel;
	let ratio: number | null;
	if (nonZero.length < 2 || chronic <= 0) {
		ratio = null;
		level = 'sem_dados';
	} else {
		ratio = acute / chronic;
		if (ratio < 0.8) level = 'baixa';
		else if (ratio <= 1.3) level = 'otima';
		else if (ratio <= 1.5) level = 'atencao';
		else level = 'alto_risco';
	}

	return {
		acute: Math.round(acute),
		chronic: Math.round(chronic),
		ratio,
		level,
		label: ACWR_LABEL[level].label,
		hint: ACWR_LABEL[level].hint
	};
}

/* ────────── Volume por grupo muscular ────────── */

export type MuscleVolume = {
	group: string;
	/** Séries somadas na semana (Σ sets dos exercícios desse grupo). */
	sets: number;
	/** Nº de exercícios distintos que atingem o grupo. */
	exercises: number;
};

type LooseExercise = { sets?: number; muscle_groups?: string[] };
type LooseSession = {
	warmup?: LooseExercise[];
	main?: LooseExercise[];
	cooldown?: LooseExercise[];
};

/**
 * Soma séries e conta exercícios por grupo muscular ao longo das sessões
 * da semana do plano. Métrica padrão de hipertrofia (séries/grupo/semana).
 * Ordena do maior volume pro menor.
 */
export function muscleGroupVolume(
	weeklySessions: LooseSession[] | undefined | null
): MuscleVolume[] {
	const map = new Map<string, { sets: number; exercises: number }>();
	for (const session of weeklySessions ?? []) {
		if (!session || typeof session !== 'object') continue;
		const blocks = [session.warmup ?? [], session.main ?? [], session.cooldown ?? []];
		for (const block of blocks) {
			if (!Array.isArray(block)) continue;
			for (const ex of block) {
				const groups = Array.isArray(ex?.muscle_groups) ? ex.muscle_groups : [];
				const sets = Number(ex?.sets) || 0;
				for (const raw of groups) {
					const group = String(raw).trim();
					if (!group) continue;
					const cur = map.get(group) ?? { sets: 0, exercises: 0 };
					cur.sets += sets;
					cur.exercises += 1;
					map.set(group, cur);
				}
			}
		}
	}
	return Array.from(map.entries())
		.map(([group, v]) => ({ group, sets: v.sets, exercises: v.exercises }))
		.sort((a, b) => b.sets - a.sets || b.exercises - a.exercises);
}
