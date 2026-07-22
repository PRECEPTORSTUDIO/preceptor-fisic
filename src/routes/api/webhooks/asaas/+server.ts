import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { asaasWebhookEvents, professionals } from '$lib/server/db/schema';
import {
	getAsaasCustomerEmail,
	planFromPayment,
	type AsaasPaymentPayload
} from '$lib/server/asaas';
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
	if (request.headers.get('asaas-access-token') !== env.ASAAS_WEBHOOK_TOKEN) {
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

	const plan = planFromPayment(payment);
	// Cobrança que não é de plano (ex: ebook): arquiva sem mexer em assinatura.
	if (!plan && ACTIVATE.has(event)) return { skipped: 'pagamento não mapeado a plano' };

	const email = await getAsaasCustomerEmail(payment.customer);
	if (!email) return { skipped: 'customer sem email no Asaas' };

	const [prof] = await db
		.select({ id: professionals.id, status: professionals.subscriptionStatus })
		.from(professionals)
		.where(sql`lower(${professionals.email}) = ${email}`)
		.limit(1);
	if (!prof) return { skipped: `sem professional com email ${email}` };

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

	return { professionalId: prof.id };
}
