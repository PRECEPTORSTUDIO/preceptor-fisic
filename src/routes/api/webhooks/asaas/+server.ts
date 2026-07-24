import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { asaasWebhookEvents, professionals } from '$lib/server/db/schema';
import {
	getAsaasCustomer,
	getAsaasCustomerEmail,
	isEbookPayment,
	planFromPayment,
	type AsaasPaymentPayload
} from '$lib/server/asaas';
import { sendEbookPurchaseAlert } from '$lib/server/email';
import { syncLeadStageFromProfessional, upsertEbookBuyerLead } from '$lib/server/queries';
import { logger } from '$lib/server/logger';

/**
 * Webhook do Asaas (billing dos planos).
 *
 * Contrato operacional (docs.asaas.com):
 * - Entrega at-least-once → inbox com UNIQUE(asaas_event_id) absorve duplicata.
 * - SÓ HTTP 200 conta como entregue (201/204/3xx/4xx/5xx penalizam a fila;
 *   15 falhas seguidas pausam o webhook). Por isso: persistiu → 200, mesmo
 *   que o processamento de negócio falhe (fica em error pra reconciliação).
 * - Autenticação: token combinado na config do webhook, header asaas-access-token.
 *
 * Dias de graça no expiresAt: cobrem o gap de renovação (boleto/pix pagos
 * com atraso) sem derrubar o acesso do assinante no dia do vencimento.
 */
const GRACE_DAYS = 5;

/** Eventos que ativam/renovam: dinheiro confirmado ou disponível. */
const ACTIVATE = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const PAST_DUE = new Set(['PAYMENT_OVERDUE']);
const CANCEL = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']);

export const POST: RequestHandler = async ({ request }) => {
	if (!env.ASAAS_WEBHOOK_TOKEN) {
		logger.error('asaas-webhook: ASAAS_WEBHOOK_TOKEN não configurado');
		return json({ error: 'not configured' }, { status: 503 });
	}
	const gotToken = Buffer.from(request.headers.get('asaas-access-token') ?? '');
	const wantToken = Buffer.from(env.ASAAS_WEBHOOK_TOKEN);
	if (gotToken.length !== wantToken.length || !timingSafeEqual(gotToken, wantToken)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	let body: { id?: string; event?: string; payment?: AsaasPaymentPayload };
	try {
		body = await request.json();
	} catch {
		// Payload ilegível: 200 pra não travar a fila; nada a persistir.
		return json({ received: true, ignored: 'unparseable' });
	}
	if (!body.id || !body.event) {
		return json({ received: true, ignored: 'missing id/event' });
	}

	// Inbox idempotente: duplicata (mesmo event id) não insere de novo.
	const inserted = await db
		.insert(asaasWebhookEvents)
		.values({
			asaasEventId: body.id,
			event: body.event,
			paymentId: body.payment?.id ?? null,
			payload: body
		})
		.onConflictDoNothing({ target: asaasWebhookEvents.asaasEventId })
		.returning({ id: asaasWebhookEvents.id });

	const eventRowId = inserted[0]?.id;
	if (!eventRowId) {
		return json({ received: true, duplicate: true });
	}

	// Processamento inline (serverless, volume baixo). Qualquer falha aqui
	// NÃO vira 4xx/5xx: o evento fica salvo com error pra reconciliação.
	try {
		const result = await applyEvent(body);
		await db
			.update(asaasWebhookEvents)
			.set({
				processedAt: sql`now()`,
				professionalId: result.professionalId ?? null,
				error: result.skipped ?? null
			})
			.where(eq(asaasWebhookEvents.id, eventRowId));
	} catch (e) {
		logger.error({ err: e }, `asaas-webhook: falha ao processar ${body.event} ${body.id}`);
		await db
			.update(asaasWebhookEvents)
			.set({ error: e instanceof Error ? e.message : String(e) })
			.where(eq(asaasWebhookEvents.id, eventRowId))
			.catch(() => {});
	}

	return json({ received: true });
};

async function applyEvent(body: {
	event?: string;
	payment?: AsaasPaymentPayload;
}): Promise<{ professionalId?: string; skipped?: string }> {
	const event = body.event!;
	const payment = body.payment;

	const relevant = ACTIVATE.has(event) || PAST_DUE.has(event) || CANCEL.has(event);
	if (!relevant) return {}; // evento só arquivado, sem regra de negócio
	if (!payment?.customer) return { skipped: 'sem customer no payload' };

	// EBOOK (cobrança avulsa): entrega é manual via Drive — avisa o responsável
	// por email com os dados do comprador e arquiva. Não mexe em assinatura.
	if (ACTIVATE.has(event) && isEbookPayment(payment)) {
		const buyer = await getAsaasCustomer(payment.customer);
		await sendEbookPurchaseAlert({
			buyerName: buyer.name,
			buyerEmail: buyer.email,
			paymentId: payment.id ?? '(sem id)',
			value: typeof payment.value === 'number' ? payment.value : null
		});
		// Comprador entra no CRM — é de lá que o time pega o email pra
		// compartilhar o ebook no Drive (entrega manual).
		if (buyer.email) {
			await upsertEbookBuyerLead({
				name: buyer.name,
				email: buyer.email,
				paymentId: payment.id ?? '(sem id)'
			});
		}
		return { skipped: `ebook vendido — alerta + lead no CRM (${buyer.email ?? 'sem email'})` };
	}

	const plan = planFromPayment(payment);
	// Cobrança que não é de plano nem ebook: arquiva sem mexer em assinatura.
	if (!plan && ACTIVATE.has(event)) return { skipped: 'pagamento não mapeado a plano' };

	// Match em 3 níveis, do determinístico pro heurístico:
	// 1. asaas_customer_id salvo na assinatura feita de dentro do app
	// 2. externalReference da cobrança (= professional.id, herdado da subscription)
	// 3. email do customer no Asaas × email da conta (links estáticos/fallback)
	let prof: { id: string; status: string } | undefined;
	[prof] = await db
		.select({ id: professionals.id, status: professionals.subscriptionStatus })
		.from(professionals)
		.where(eq(professionals.asaasCustomerId, payment.customer))
		.limit(1);

	if (!prof && typeof payment.externalReference === 'string' && payment.externalReference) {
		[prof] = await db
			.select({ id: professionals.id, status: professionals.subscriptionStatus })
			.from(professionals)
			.where(sql`${professionals.id}::text = ${payment.externalReference}`)
			.limit(1);
	}

	if (!prof) {
		const email = await getAsaasCustomerEmail(payment.customer);
		if (!email) return { skipped: 'customer sem email no Asaas' };
		[prof] = await db
			.select({ id: professionals.id, status: professionals.subscriptionStatus })
			.from(professionals)
			.where(sql`lower(${professionals.email}) = ${email}`)
			.limit(1);
		if (!prof) return { skipped: `sem professional com email ${email}` };
		// Pagou por link estático mas o email casou: cola o customer id na conta
		// pra TODOS os eventos futuros caírem no match determinístico.
		await db
			.update(professionals)
			.set({ asaasCustomerId: payment.customer, updatedAt: sql`now()` })
			.where(eq(professionals.id, prof.id))
			.catch(() => {}); // unique violation (customer já de outra conta): segue com o match por email
	}

	if (ACTIVATE.has(event) && plan) {
		const expires = new Date();
		expires.setMonth(expires.getMonth() + plan.months);
		expires.setDate(expires.getDate() + GRACE_DAYS);
		await db
			.update(professionals)
			.set({
				subscriptionStatus: 'active',
				subscriptionPlan: plan.plan,
				subscriptionExpiresAt: expires,
				updatedAt: sql`now()`
			})
			.where(eq(professionals.id, prof.id));
	} else if (PAST_DUE.has(event)) {
		// Só rebaixa quem está ativo — não mexe em trial/cancelado.
		if (prof.status === 'active') {
			await db
				.update(professionals)
				.set({ subscriptionStatus: 'past_due', updatedAt: sql`now()` })
				.where(eq(professionals.id, prof.id));
		}
	} else if (CANCEL.has(event)) {
		await db
			.update(professionals)
			.set({ subscriptionStatus: 'cancelled', updatedAt: sql`now()` })
			.where(eq(professionals.id, prof.id));
	}

	// Espelha a mudança de assinatura no funil do CRM (pagante/cancelado/...).
	// Best-effort: falha aqui não pode derrubar o processamento do pagamento.
	await syncLeadStageFromProfessional(prof.id).catch((e) =>
		logger.warn({ err: String(e).slice(0, 200) }, 'asaas-webhook.lead-sync.failed')
	);

	return { professionalId: prof.id };
}
