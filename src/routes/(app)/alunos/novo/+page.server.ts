import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getProfessionalByAuthId, createStudentTx } from '$lib/server/queries';
import { parseDateISO, parseDecimalBR } from '$lib/server/form-utils';
import { localDateKey } from '$lib/server/tz';
import { audit, clientFingerprint } from '$lib/server/audit';
import { signStudentToken } from '$lib/server/aluno-token';
import { sendStudentMagicLink, sendStudentFillLink } from '$lib/server/email';
import { checkRateLimit } from '$lib/server/rate-limit';
import { env as pubEnv } from '$env/dynamic/public';
import { logger } from '$lib/server/logger';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');
	return {};
}) satisfies PageServerLoad;

const SexEnum = z.enum(['feminino', 'masculino', 'outro', 'nao_informado']);
const RiskEnum = z.enum(['baixo', 'moderado', 'alto', 'muito_alto']);
const ExpEnum = z.enum(['iniciante', 'intermediario', 'avancado']);
const DifficultyEnum = z.enum(['pequena', 'media', 'alta']);

const fullSchema = z.object({
	name: z.string().min(2).max(160),
	birthDate: z.string().optional().nullable(),
	sex: SexEnum,
	weightKg: z
		.number()
		.min(20, 'peso deve estar entre 20 e 400 kg')
		.max(400, 'peso deve estar entre 20 e 400 kg')
		.nullable()
		.optional(),
	heightCm: z
		.number()
		.min(100, 'altura deve estar entre 100 e 250 cm — informe em centímetros (ex.: 175)')
		.max(250, 'altura deve estar entre 100 e 250 cm')
		.nullable()
		.optional(),
	phone: z.string().optional().nullable(),
	email: z.string().email().optional().nullable().or(z.literal('')),
	cardiovascularRisk: RiskEnum,
	diagnoses: z.string().optional().default(''), // CSV
	medications: z.string().optional().default(''), // CSV
	limitations: z.string().optional().default(''), // CSV → vira healthProfile.injuries
	goals: z.array(z.string()).default([]),
	weeklySessions: z.number().int().min(1).max(7),
	minutesPerSession: z.number().int().min(15).max(180),
	experienceLevel: ExpEnum,
	prescribedDifficulty: DifficultyEnum.default('media'),
	trainingSplit: z.enum(['auto', 'full_body', 'upper_lower', 'push_pull_legs']).default('auto')
});

const linkSchema = z.object({
	name: z.string().min(2).max(160),
	email: z.string().email(),
	birthDate: z.string().min(1)
});

function parseList(s: string): string[] {
	return s
		.split(/[,\n;]+/)
		.map((x) => x.trim())
		.filter(Boolean);
}

function appBaseUrl(origin: string): string {
	return (pubEnv.PUBLIC_APP_URL?.replace(/\/$/, '') || origin).replace(/\/$/, '');
}

export const actions: Actions = {
	default: async ({ request, locals, url, getClientAddress }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const mode = String(fd.get('mode') ?? 'completo') === 'link' ? 'link' : 'completo';

		// ───────── MODO LINK: só nome, e-mail e data de nasc. ─────────
		if (mode === 'link') {
			const raw = {
				name: String(fd.get('name') ?? '').trim(),
				email: String(fd.get('email') ?? '').trim(),
				birthDate: String(fd.get('birthDate') ?? '').trim()
			};
			const parsed = linkSchema.safeParse(raw);
			if (!parsed.success) {
				return fail(400, {
					error: 'Preencha nome, e-mail e data de nascimento.',
					issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
					mode,
					values: raw
				});
			}

			// Sem isso, data BR (dd/mm/aaaa) ia crua pra coluna date do Postgres
			// e a transação estourava um 500, perdendo o form inteiro.
			const birthDate = parseDateISO(parsed.data.birthDate);
			if (!birthDate)
				return fail(400, {
					error: 'data de nascimento inválida (use AAAA-MM-DD ou DD/MM/AAAA)',
					mode,
					values: raw
				});
			if (birthDate > localDateKey(new Date()))
				return fail(400, { error: 'data de nascimento não pode ser no futuro', mode, values: raw });

			let id: string;
			try {
				id = await createStudentTx({
					professionalId: professional.id,
					name: parsed.data.name,
					birthDate,
					sex: 'nao_informado',
					email: parsed.data.email,
					// LGPD art. 11: no modo link quem consente é o titular, em
					// /a/[id]/completar (coalesce carimba lá). Não carimbar aqui.
					consentAcceptedAt: null,
					diagnoses: [],
					medications: [],
					cardiovascularRisk: 'baixo',
					experienceLevel: 'iniciante',
					prescribedDifficulty: 'media',
					weeklySessions: 3,
					minutesPerSession: 60,
					goals: [],
					profileComplete: false
				});
			} catch (e) {
				return fail(400, {
					error: 'erro ao salvar aluno: ' + (e as Error).message,
					mode,
					values: raw
				});
			}

			audit({
				action: 'student.create',
				professionalId: professional.id,
				entityType: 'student',
				entityId: id,
				...clientFingerprint(request, getClientAddress)
			});

			const token = signStudentToken(id);
			const fillUrl = `${appBaseUrl(url.origin)}/a/${id}/completar?t=${token}`;

			// Dispara o e-mail com o link (best-effort, não bloqueia).
			// Rate limit por professional: criar alunos em série não pode virar
			// canal de spam com o domínio verificado do Resend.
			const rl = checkRateLimit('email_send', `student-create:${professional.id}`);
			try {
				if (!rl.allowed) throw new Error('rate-limited');
				await sendStudentFillLink({
					to: parsed.data.email,
					studentName: parsed.data.name,
					professionalName: professional.name,
					fillUrl
				});
			} catch (err) {
				logger.error(
					{ studentId: id, err: String(err).slice(0, 200) },
					'student.fill_link.email_failed'
				);
			}

			return { mode, fillUrl, studentName: parsed.data.name };
		}

		// ───────── MODO COMPLETO ─────────
		const raw = {
			name: String(fd.get('name') ?? '').trim(),
			birthDate: String(fd.get('birthDate') ?? '').trim() || null,
			sex: String(fd.get('sex') ?? 'nao_informado'),
			weightKg: parseDecimalBR(fd.get('weightKg')),
			heightCm: parseDecimalBR(fd.get('heightCm')),
			phone: String(fd.get('phone') ?? '').trim() || null,
			email: String(fd.get('email') ?? '').trim() || null,
			cardiovascularRisk: String(fd.get('cardiovascularRisk') ?? 'baixo'),
			diagnoses: String(fd.get('diagnoses') ?? ''),
			medications: String(fd.get('medications') ?? ''),
			limitations: String(fd.get('limitations') ?? ''),
			goals: fd.getAll('goals').map(String),
			weeklySessions: Number(fd.get('weeklySessions') ?? 3),
			minutesPerSession: Number(fd.get('minutesPerSession') ?? 60),
			experienceLevel: String(fd.get('experienceLevel') ?? 'iniciante'),
			prescribedDifficulty: String(fd.get('prescribedDifficulty') ?? 'media'),
			trainingSplit: String(fd.get('trainingSplit') ?? 'auto')
		};

		// parseDecimalBR devolve null pra texto não-parseável — distingue de
		// vazio pra não silenciar "70,5abc" digitado num campo agora type=text.
		if (String(fd.get('weightKg') ?? '').trim() && raw.weightKg == null)
			return fail(400, {
				error: 'peso inválido — use apenas números (ex.: 72,5)',
				mode,
				values: raw
			});
		if (String(fd.get('heightCm') ?? '').trim() && raw.heightCm == null)
			return fail(400, {
				error: 'altura inválida — use apenas números (ex.: 175)',
				mode,
				values: raw
			});

		// Sem isso, data BR (dd/mm/aaaa) ia crua pra coluna date do Postgres
		// e a transação estourava um 500, perdendo o form inteiro.
		let birthDate: string | null = null;
		if (raw.birthDate) {
			birthDate = parseDateISO(raw.birthDate);
			if (!birthDate)
				return fail(400, {
					error: 'data de nascimento inválida (use AAAA-MM-DD ou DD/MM/AAAA)',
					mode,
					values: raw
				});
			if (birthDate > localDateKey(new Date()))
				return fail(400, { error: 'data de nascimento não pode ser no futuro', mode, values: raw });
		}

		const parsed = fullSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, {
				error: 'dados inválidos',
				issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
				mode,
				values: raw
			});
		}

		let id: string;
		try {
			id = await createStudentTx({
				professionalId: professional.id,
				name: parsed.data.name,
				birthDate,
				sex: parsed.data.sex,
				weightKg: parsed.data.weightKg ?? null,
				heightCm: parsed.data.heightCm ?? null,
				phone: parsed.data.phone,
				email: parsed.data.email || null,
				consentAcceptedAt: new Date(),
				diagnoses: parseList(parsed.data.diagnoses).map((label) => ({ label })),
				medications: parseList(parsed.data.medications).map((name) => ({ name })),
				injuries: parseList(parsed.data.limitations).map((region) => ({ region })),
				cardiovascularRisk: parsed.data.cardiovascularRisk,
				experienceLevel: parsed.data.experienceLevel,
				prescribedDifficulty: parsed.data.prescribedDifficulty,
				trainingSplit: parsed.data.trainingSplit,
				weeklySessions: parsed.data.weeklySessions,
				minutesPerSession: parsed.data.minutesPerSession,
				goals: parsed.data.goals,
				profileComplete: true
			});
		} catch (e) {
			return fail(400, {
				error: 'erro ao salvar aluno: ' + (e as Error).message,
				mode,
				values: raw
			});
		}

		audit({
			action: 'student.create',
			professionalId: professional.id,
			entityType: 'student',
			entityId: id,
			...clientFingerprint(request, getClientAddress)
		});

		// Se o aluno tem email cadastrado, dispara o magic-link automaticamente.
		// Mesmo rate limit do fluxo de fill-link: criação em série não pode
		// virar canal de spam.
		if (parsed.data.email) {
			const rl = checkRateLimit('email_send', `student-create:${professional.id}`);
			try {
				if (!rl.allowed) throw new Error('rate-limited');
				const token = signStudentToken(id);
				const magicLinkUrl = `${appBaseUrl(url.origin)}/a/${id}?t=${token}`;
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
