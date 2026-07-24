import { env } from '$env/dynamic/private';

/**
 * Cliente mínimo da API Asaas v3 (billing dos planos).
 *
 * Auth é via header `access_token` (não Bearer). User-Agent é obrigatório
 * pra contas novas. Chave NUNCA vai pro client — este módulo é server-only.
 * Docs: https://docs.asaas.com/reference/comece-por-aqui
 */
const BASE_URL = 'https://api.asaas.com/v3';

export function asaasEnabled(): boolean {
	return Boolean(env.ASAAS_API_KEY);
}

export async function asaasGet<T>(path: string): Promise<T> {
	if (!env.ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada');
	const res = await fetch(`${BASE_URL}${path}`, {
		headers: {
			'access_token': env.ASAAS_API_KEY,
			'User-Agent': 'preceptor-fisic',
			'Content-Type': 'application/json'
		},
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) {
		// Nunca logar a chave; o path é seguro (ids Asaas, sem PII)
		throw new Error(`Asaas GET ${path} → HTTP ${res.status}`);
	}
	return res.json() as Promise<T>;
}

/**
 * Mapa link de pagamento → plano interno.
 * Ids vêm dos payment links criados no painel do Asaas (GET /paymentLinks).
 * Renovações de assinatura podem chegar SEM paymentLink no payload — por
 * isso o fallback por valor em planFromPayment().
 */
export const PAYMENT_LINKS = {
	essencial_mensal: {
		id: '5c8m1fhyd6c3tsaq',
		url: 'https://www.asaas.com/c/5c8m1fhyd6c3tsaq',
		plan: 'essencial',
		value: 69.9,
		months: 1
	},
	essencial_anual: {
		id: 'n2xcnopwqy3n305n',
		url: 'https://www.asaas.com/c/n2xcnopwqy3n305n',
		plan: 'essencial',
		value: 699.0,
		months: 12
	},
	pro_mensal: {
		id: 'qihvgcw48aajit37',
		url: 'https://www.asaas.com/c/qihvgcw48aajit37',
		plan: 'pro',
		value: 149.9,
		months: 1
	},
	pro_anual: {
		id: '9208gp2b2h8mduc7',
		url: 'https://www.asaas.com/c/9208gp2b2h8mduc7',
		plan: 'pro',
		value: 1498.8,
		months: 12
	}
} as const;

export interface AsaasPaymentPayload {
	id?: string;
	status?: string;
	customer?: string;
	paymentLink?: string | null;
	subscription?: string | null;
	value?: number;
	[key: string]: unknown;
}

/**
 * Resolve o plano de um payment: primeiro pelo paymentLink, depois pelo
 * valor (renovações). Retorna null se não reconhecer (ex: ebook, cobrança
 * avulsa criada à mão) — nesse caso o webhook não mexe na assinatura.
 */
export function planFromPayment(
	payment: AsaasPaymentPayload
): { plan: string; months: number } | null {
	const links = Object.values(PAYMENT_LINKS);
	if (payment.paymentLink) {
		const byLink = links.find((l) => l.id === payment.paymentLink);
		if (byLink) return { plan: byLink.plan, months: byLink.months };
	}
	if (typeof payment.value === 'number') {
		const byValue = links.find((l) => Math.abs(l.value - payment.value!) < 0.01);
		if (byValue) return { plan: byValue.plan, months: byValue.months };
	}
	return null;
}

export async function getAsaasCustomerEmail(customerId: string): Promise<string | null> {
	const c = await asaasGet<{ email?: string | null }>(`/customers/${customerId}`);
	return c.email?.trim().toLowerCase() || null;
}

export async function getAsaasCustomer(
	customerId: string
): Promise<{ name: string | null; email: string | null }> {
	const c = await asaasGet<{ name?: string | null; email?: string | null }>(
		`/customers/${customerId}`
	);
	return { name: c.name ?? null, email: c.email?.trim().toLowerCase() || null };
}

/** Link de pagamento avulso do Ebook ACSM (R$ 29,90). Entrega manual via Drive. */
export const EBOOK_PAYMENT_LINK_ID = 'mtnzj35g4ckbbukf';
export const EBOOK_VALUE = 29.9;

export function isEbookPayment(payment: AsaasPaymentPayload): boolean {
	if (payment.paymentLink === EBOOK_PAYMENT_LINK_ID) return true;
	return typeof payment.value === 'number' && Math.abs(payment.value - EBOOK_VALUE) < 0.01;
}

async function asaasPost<T>(path: string, body: unknown): Promise<T> {
	if (!env.ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada');
	const res = await fetch(`${BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'access_token': env.ASAAS_API_KEY,
			'User-Agent': 'preceptor-fisic',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20_000)
	});
	const data = (await res.json().catch(() => null)) as
		| (T & { errors?: { description?: string }[] })
		| null;
	if (!res.ok || data?.errors?.length) {
		const desc = data?.errors?.[0]?.description ?? `HTTP ${res.status}`;
		throw new Error(`Asaas POST ${path}: ${desc}`);
	}
	return data as T;
}

/**
 * Cria o customer no Asaas com os dados DA CONTA (email do cadastro, não o
 * que a pessoa digitaria num checkout avulso) — é isso que torna o match do
 * webhook determinístico. CPF é exigência do Asaas em produção.
 */
export async function createAsaasCustomer(input: {
	name: string;
	email: string;
	cpfCnpj: string;
	professionalId: string;
}): Promise<string> {
	const c = await asaasPost<{ id: string }>('/customers', {
		name: input.name,
		email: input.email,
		cpfCnpj: input.cpfCnpj,
		externalReference: input.professionalId
	});
	return c.id;
}

/**
 * Cria a assinatura e devolve a URL da fatura hospedada da 1ª cobrança.
 * billingType UNDEFINED = pagador escolhe Pix/cartão na fatura do Asaas
 * (nenhum dado de cartão passa pelo nosso servidor — fora de escopo PCI).
 * A cobrança da assinatura pode demorar alguns instantes pra materializar,
 * por isso o retry curto no GET de payments.
 */
export async function createPlanSubscription(input: {
	customerId: string;
	planKey: keyof typeof PAYMENT_LINKS;
	professionalId: string;
}): Promise<{ subscriptionId: string; invoiceUrl: string | null }> {
	const plan = PAYMENT_LINKS[input.planKey];
	const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
	const sub = await asaasPost<{ id: string }>('/subscriptions', {
		customer: input.customerId,
		billingType: 'UNDEFINED',
		value: plan.value,
		cycle: plan.months === 12 ? 'YEARLY' : 'MONTHLY',
		nextDueDate: today,
		description: `PreceptorFISIC · plano ${plan.plan} ${plan.months === 12 ? 'anual' : 'mensal'}`,
		externalReference: input.professionalId
	});

	let invoiceUrl: string | null = null;
	for (let attempt = 0; attempt < 3 && !invoiceUrl; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
		const payments = await asaasGet<{ data?: { invoiceUrl?: string }[] }>(
			`/subscriptions/${sub.id}/payments?limit=1`
		);
		invoiceUrl = payments.data?.[0]?.invoiceUrl ?? null;
	}
	return { subscriptionId: sub.id, invoiceUrl };
}
