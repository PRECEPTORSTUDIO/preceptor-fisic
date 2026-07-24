import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getAlunoSelfFillData, completeStudentSelfFillTx } from '$lib/server/queries';
import { parseDecimalBR, clamp } from '$lib/server/form-utils';
import { verifyStudentAccess, alunoDevBypass } from '$lib/server/aluno-token';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, url }) => {
	const token = url.searchParams.get('t');
	if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
		error(403, 'link inválido ou expirado — peça pro seu treinador um novo link.');
	}

	const data = await getAlunoSelfFillData(params.id);
	if (!data) error(404, 'cadastro não encontrado');

	return { ...data, token };
}) satisfies PageServerLoad;

const RiskEnum = z.enum(['baixo', 'moderado', 'alto', 'muito_alto']);
const ExpEnum = z.enum(['iniciante', 'intermediario', 'avancado']);
const DifficultyEnum = z.enum(['pequena', 'media', 'alta']);

// Aceita só ISO (yyyy-mm-dd) ou vazio. Sem isso, um "31/12/1990" (dd/mm/yyyy,
// comum no BR) passa e estoura na coluna date do Postgres → 500.
const isoDate = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve estar no formato AAAA-MM-DD')
	.refine((s) => !Number.isNaN(new Date(s).getTime()), 'data inválida');

const schema = z.object({
	birthDate: isoDate.nullable().optional(),
	weightKg: z.number().positive().nullable().optional(),
	heightCm: z.number().positive().nullable().optional(),
	phone: z.string().optional().nullable(),
	cardiovascularRisk: RiskEnum,
	diagnoses: z.string().optional().default(''),
	medications: z.string().optional().default(''),
	limitations: z.string().optional().default(''),
	goals: z.array(z.string()).min(1, 'selecione ao menos 1 objetivo'),
	weeklySessions: z.number().int().min(1).max(7),
	minutesPerSession: z.number().int().min(15).max(180),
	experienceLevel: ExpEnum,
	prescribedDifficulty: DifficultyEnum
});

function parseList(s: string): string[] {
	return s
		.split(/[,\n;]+/)
		.map((x) => x.trim())
		.filter(Boolean);
}

export const actions: Actions = {
	default: async ({ params, request, url }) => {
		const token = url.searchParams.get('t');
		if (!(await verifyStudentAccess(params.id, token)) && !alunoDevBypass()) {
			return fail(403, { error: 'link inválido ou expirado.' });
		}

		const fd = await request.formData();

		// Consent LGPD art. 11 (dados de saúde exigem consentimento explícito
		// do titular). O checkbox é do próprio aluno — diferente do fluxo
		// "profissional cadastra", aqui o titular consente em primeira pessoa.
		if (!fd.get('accept_privacy')) {
			return fail(400, {
				error: 'É preciso aceitar a Política de Privacidade pra continuar.'
			});
		}

		const raw = {
			birthDate: String(fd.get('birthDate') ?? '').trim() || null,
			// parseDecimalBR: aluno digita "72,5" no celular — Number() cru
			// rejeitava a vírgula e o campo virava null silenciosamente.
			weightKg: clamp(parseDecimalBR(fd.get('weightKg')), 20, 400),
			heightCm: clamp(parseDecimalBR(fd.get('heightCm')), 100, 250),
			phone: String(fd.get('phone') ?? '').trim() || null,
			cardiovascularRisk: String(fd.get('cardiovascularRisk') ?? 'baixo'),
			diagnoses: String(fd.get('diagnoses') ?? ''),
			medications: String(fd.get('medications') ?? ''),
			limitations: String(fd.get('limitations') ?? ''),
			goals: fd.getAll('goals').map(String),
			weeklySessions: Number(fd.get('weeklySessions') ?? 3),
			minutesPerSession: Number(fd.get('minutesPerSession') ?? 60),
			experienceLevel: String(fd.get('experienceLevel') ?? 'iniciante'),
			prescribedDifficulty: String(fd.get('prescribedDifficulty') ?? 'media')
		};

		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, {
				error: 'Confira os campos destacados.',
				issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
				values: raw
			});
		}

		await completeStudentSelfFillTx({
			studentId: params.id,
			birthDate: parsed.data.birthDate,
			weightKg: parsed.data.weightKg ?? null,
			heightCm: parsed.data.heightCm ?? null,
			phone: parsed.data.phone,
			diagnoses: parseList(parsed.data.diagnoses).map((label) => ({ label })),
			medications: parseList(parsed.data.medications).map((name) => ({ name })),
			injuries: parseList(parsed.data.limitations).map((region) => ({ region })),
			cardiovascularRisk: parsed.data.cardiovascularRisk,
			experienceLevel: parsed.data.experienceLevel,
			prescribedDifficulty: parsed.data.prescribedDifficulty,
			weeklySessions: parsed.data.weeklySessions,
			minutesPerSession: parsed.data.minutesPerSession,
			goals: parsed.data.goals
		});

		const tq = token ? `?t=${token}` : '';
		redirect(303, `/a/${params.id}${tq}`);
	}
};
