import { redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getProfessionalByAuthId } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	if (!locals.user) {
		// Sem auth (modo design) — devolve null pro layout/páginas tratarem
		return { professional: null, user: null, sidebarCounts: null };
	}

	const professional = await getProfessionalByAuthId(locals.user.id);
	if (!professional) {
		// Auth user existe mas não tem professional record → onboarding
		redirect(303, '/onboarding');
	}

	// Counts do sidebar (1 query agregada — sem N+1)
	const result = await db.execute<{
		students_count: number;
		unread_messages: number;
		new_leads: number;
	}>(sql`
		SELECT
			(SELECT COUNT(*) FROM students
				WHERE professional_id = ${professional.id} AND deleted_at IS NULL)::int AS students_count,
			(SELECT COUNT(*) FROM messages m
				JOIN conversations c ON c.id = m.conversation_id
				WHERE c.professional_id = ${professional.id}
				  AND m.from_role = 'student'
				  AND m.read_at IS NULL)::int AS unread_messages,
			-- Leads "novos" no CRM admin = recém cadastrados (signups)
			-- Só conta se for admin, mas a query roda sempre (filtragem depois)
			(SELECT COUNT(*) FROM leads
				WHERE stage = 'cadastrou')::int AS new_leads
	`);
	const list = (result as unknown as { rows?: typeof result }).rows ?? result;
	const counts = (list as Array<{
		students_count: number;
		unread_messages: number;
		new_leads: number;
	}>)[0];

	return {
		professional: {
			id: professional.id,
			name: professional.name,
			email: professional.email,
			cref: professional.cref,
			specialty: professional.specialty,
			avatarUrl: professional.avatarUrl,
			isAdmin: professional.isAdmin
		},
		user: { id: locals.user.id, email: locals.user.email },
		sidebarCounts: {
			students: Number(counts?.students_count ?? 0),
			unreadMessages: Number(counts?.unread_messages ?? 0),
			// Pra não-admins, force 0 — eles nem veem o item de CRM no sidebar
			newLeads: professional.isAdmin ? Number(counts?.new_leads ?? 0) : 0
		}
	};
}) satisfies LayoutServerLoad;
