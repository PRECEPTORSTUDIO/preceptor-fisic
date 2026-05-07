import { error, fail } from '@sveltejs/kit';
import { getStudentDetail, getProfessionalByAuthId } from '$lib/server/queries';
import { signStudentToken } from '$lib/server/aluno-token';
import { sendStudentMagicLink } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const detail = await getStudentDetail(params.id, professional.id);
	if (!detail) error(404, 'aluno não encontrado');

	const token = signStudentToken(params.id);
	const alunoUrl = `${url.origin}/a/${params.id}?t=${token}`;

	return { detail, alunoUrl };
};

export const actions: Actions = {
	resendMagicLink: async ({ params, locals, url }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		const professional = await getProfessionalByAuthId(locals.user.id);
		if (!professional) return fail(401, { error: 'professional não encontrado' });

		const detail = await getStudentDetail(params.id!, professional.id);
		if (!detail) return fail(404, { error: 'aluno não encontrado' });
		if (!detail.student.email) {
			return fail(400, {
				error: 'Aluno não tem email cadastrado. Adicione o email primeiro em Editar.'
			});
		}

		const token = signStudentToken(params.id!);
		const magicLinkUrl = `${url.origin}/a/${params.id}?t=${token}`;
		const result = await sendStudentMagicLink({
			to: detail.student.email,
			studentName: detail.student.name,
			professionalName: professional.name,
			magicLinkUrl
		});

		if (result.skipped) {
			return fail(503, {
				error: 'Serviço de email não configurado (RESEND_API_KEY ausente).'
			});
		}
		if (!result.sent) {
			return fail(500, { error: result.error ?? 'Falha ao enviar.' });
		}
		return { success: true, sentTo: detail.student.email };
	}
};
