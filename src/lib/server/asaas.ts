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
