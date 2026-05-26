import { error, fail, redirect } from '@sveltejs/kit';
import { getStudentDetail, getProfessionalByAuthId, createAssessment } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, parent }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const detail = await getStudentDetail(params.id, professional.id);
	if (!detail) error(404, 'aluno não encontrado');

	return { student: detail.student };
}) satisfies PageServerLoad;

function num(fd: FormData, key: string): number | undefined {
	const v = fd.get(key);
	if (v == null || String(v).trim() === '') return undefined;
	const n = Number(String(v).replace(',', '.'));
	return Number.isFinite(n) ? n : undefined;
}

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const fd = await request.formData();
		const weightKg = num(fd, 'weightKg');
		const heightCm = num(fd, 'heightCm');
		const bmi =
			weightKg && heightCm ? Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10 : undefined;

		try {
			await createAssessment({
				professionalId: professional.id,
				studentId: params.id!,
				weightKg,
				bodyFatPct: num(fd, 'bodyFatPct'),
				leanMassKg: num(fd, 'leanMassKg'),
				bmi,
				restingHr: num(fd, 'restingHr'),
				bloodPressureSystolic: num(fd, 'bpSys'),
				bloodPressureDiastolic: num(fd, 'bpDia'),
				notes: String(fd.get('notes') ?? '').trim() || undefined
			});
		} catch (e) {
			return fail(500, { error: (e as Error).message });
		}

		redirect(303, `/alunos/${params.id}`);
	}
};
