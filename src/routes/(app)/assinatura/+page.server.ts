import { error, fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { professionals } from '$lib/server/db/schema';
import {
	asaasEnabled,
	createAsaasCustomer,
	createPlanSubscription,
	PAYMENT_LINKS
} from '$lib/server/asaas';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	if (!locals.user) error(401, 'não autenticado');
	// O professional do layout é uma projeção enxuta (sem campos de billing) —
	// busca aqui a linha com status/plano/vencimento/asaasCustomerId.
	const [professional] = await db
		.select({
			id: professionals.id,
			name: professionals.name,
			email: professionals.email,
			subscriptionStatus: professionals.subscriptionStatus,
			subscriptionPlan: professionals.subscriptionPlan,
			subscriptionExpiresAt: professionals.subscriptionExpiresAt,
			asaasCustomerId: professionals.asaasCustomerId
		})
		.from(professionals)
		.where(eq(professionals.authUserId, locals.user.id))
		.limit(1);
	if (!professional) error(401, 'não autenticado');
	return {
		professional,
		billingEnabled: asaasEnabled()
	};
}) satisfies PageServerLoad;

const PLAN_KEYS = Object.keys(PAYMENT_LINKS) as (keyof typeof PAYMENT_LINKS)[];

/** Valida CPF (11 dígitos + dígitos verificadores) ou CNPJ (14 dígitos, só formato). */
function validCpfCnpj(raw: string): string | null {
	const d = raw.replace(/\D/g, '');
	if (d.length === 14) return d; // CNPJ: Asaas valida os DVs
	if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
	const dv = (slice: number) => {
		let sum = 0;
		for (let i = 0; i < slice; i++) sum += Number(d[i]) * (slice + 1 - i);
		const r = (sum * 10) % 11;
		return r === 10 ? 0 : r;
	};
	return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
}

export const actions: Actions = {
	subscribe: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'não autenticado' });
		if (!asaasEnabled()) return fail(503, { error: 'pagamentos indisponíveis no momento' });

		const fd = await request.formData();
		const planKey = String(fd.get('plan') ?? '') as keyof typeof PAYMENT_LINKS;
		const cpfRaw = String(fd.get('cpf') ?? '');
		if (!PLAN_KEYS.includes(planKey)) return fail(400, { error: 'plano inválido' });

		const [prof] = await db
			.select({
				id: professionals.id,
				name: professionals.name,
				email: professionals.email,
				asaasCustomerId: professionals.asaasCustomerId
			})
			.from(professionals)
			.where(eq(professionals.authUserId, locals.user.id))
			.limit(1);
		if (!prof) return fail(401, { error: 'não autenticado' });

		let customerId = prof.asaasCustomerId;
		if (!customerId) {
			const cpfCnpj = validCpfCnpj(cpfRaw);
			if (!cpfCnpj) return fail(400, { error: 'CPF/CNPJ inválido' });
			try {
				customerId = await createAsaasCustomer({
					name: prof.name,
					email: prof.email,
					cpfCnpj,
					professionalId: prof.id
				});
			} catch (e) {
				logger.error({ err: String(e).slice(0, 300) }, 'assinatura.customer.failed');
				return fail(502, { error: 'não foi possível iniciar a assinatura, tente de novo' });
			}
			await db
				.update(professionals)
				.set({ asaasCustomerId: customerId, updatedAt: sql`now()` })
				.where(eq(professionals.id, prof.id));
		}

		let invoiceUrl: string | null;
		try {
			({ invoiceUrl } = await createPlanSubscription({
				customerId,
				planKey,
				professionalId: prof.id
			}));
		} catch (e) {
			logger.error({ err: String(e).slice(0, 300) }, 'assinatura.subscription.failed');
			return fail(502, { error: 'não foi possível gerar a cobrança, tente de novo' });
		}

		if (!invoiceUrl) {
			// Assinatura criada mas fatura ainda materializando — o webhook ativa
			// quando pagar; a pessoa recebe a fatura por email do próprio Asaas.
			return { success: true, pendingInvoice: true };
		}
		redirect(303, invoiceUrl);
	}
} satisfies Actions;
