import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getProfessionalByAuthId, createStudentTx } from '$lib/server/queries';
import { signStudentToken } from '$lib/server/aluno-token';
import { sendStudentMagicLink } from '$lib/server/email';
import { env as pubEnv } from '$env/dynamic/public';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	return {};
}) satisfies PageServerLoad;

const SexEnum = z.enum(['feminino', 'masculino', 'outro', 'nao_informado']);
const RiskEnum = z.enum(['baixo', 'moderado', 'alto', 'muito_alto']);
const ExpEnum = z.enum(['iniciante', 'intermediario', 'avancado']);

const inputSchema = z.object({
	name: z.string().min(2).max(160),
	birthDate: z.string().optional().nullable(),
	sex: SexEnum,
	weightKg: z.number().positive().nullable().optional(),
	heightCm: z.number().positive().nullable().optional(),
	phone: z.string().optional().nullable(),
	email: z.string().email().optional().nullable().or(z.literal('')),
	cardiovascularRisk: RiskEnum,
	diagnoses: z.string().optional().default(''), // CSV
	medications: z.string().optional().default(''), // CSV
	goals: z.array(z.string()).default([]),
	weeklySessions: z.number().int().min(1).max(7),
	minutesPerSession: z.number().int().min(15).max(180),
	experienceLevel: ExpEnum,
	equipment: z.string().optional().default('') // CSV
});

function parseList(s: string): string[] {
	return s
		.split(/[,\n;]+/)
		.map((x) => x.trim())
		.filter(Boolean);
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const raw = {
			name: String(fd.get('name') ?? '').trim(),
			birthDate: String(fd.get('birthDate') ?? '').trim() || null,
			sex: String(fd.get('sex') ?? 'nao_informado'),
			weightKg: fd.get('weightKg') ? Number(fd.get('weightKg')) : null,
			heightCm: fd.get('heightCm') ? Number(fd.get('heightCm')) : null,
			phone: String(fd.get('phone') ?? '').trim() || null,
			email: String(fd.get('email') ?? '').trim() || null,
			cardiovascularRisk: String(fd.get('cardiovascularRisk') ?? 'baixo'),
			diagnoses: String(fd.get('diagnoses') ?? ''),
			medications: String(fd.get('medications') ?? ''),
			goals: fd.getAll('goals').map(String),
			weeklySessions: Number(fd.get('weeklySessions') ?? 3),
			minutesPerSession: Number(fd.get('minutesPerSession') ?? 60),
			experienceLevel: String(fd.get('experienceLevel') ?? 'iniciante'),
			equipment: String(fd.get('equipment') ?? '')
		};

		const parsed = inputSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, {
				error: 'dados inválidos',
				issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
				values: raw
			});
		}

		const id = await createStudentTx({
			professionalId: professional.id,
			name: parsed.data.name,
			birthDate: parsed.data.birthDate,
			sex: parsed.data.sex,
			weightKg: parsed.data.weightKg ?? null,
			heightCm: parsed.data.heightCm ?? null,
			phone: parsed.data.phone,
			email: parsed.data.email || null,
			consentAcceptedAt: new Date(),
			diagnoses: parseList(parsed.data.diagnoses).map((label) => ({ label })),
			medications: parseList(parsed.data.medications).map((name) => ({ name })),
			cardiovascularRisk: parsed.data.cardiovascularRisk,
			experienceLevel: parsed.data.experienceLevel,
			weeklySessions: parsed.data.weeklySessions,
			minutesPerSession: parsed.data.minutesPerSession,
			goals: parsed.data.goals,
			equipmentAvailable: parseList(parsed.data.equipment)
		});

		// Se o aluno tem email cadastrado, dispara o magic-link automaticamente.
		// Não bloqueia: erro de email não impede criação do aluno.
		if (parsed.data.email) {
			try {
				const token = signStudentToken(id);
				const appUrl = (
					pubEnv.PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://preceptor-fisic.vercel.app'
				);
				const magicLinkUrl = `${appUrl}/a/${id}?t=${token}`;
				await sendStudentMagicLink({
					to: parsed.data.email,
					studentName: parsed.data.name,
					professionalName: professional.name,
					magicLinkUrl
				});
			} catch (err) {
				logger.error(
					{ studentId: id, email: parsed.data.email, err: String(err).slice(0, 200) },
					'student.magic_link.send_failed'
				);
			}
		}

		redirect(303, `/alunos/${id}`);
	}
};
