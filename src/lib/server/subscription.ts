/**
 * Gate de assinatura server-side.
 *
 * Regra: trial tem acesso (é o funil de venda); active tem acesso enquanto
 * subscriptionExpiresAt não passou (o webhook Asaas já grava a data com dias
 * de graça — ver api/webhooks/asaas). past_due/cancelled/inactive bloqueiam
 * as features de custo real (geração de IA). Checar SEMPRE no servidor —
 * esconder botão na UI não é gate.
 */
import type { Professional } from './db/schema';

type SubscriptionFields = Pick<Professional, 'subscriptionStatus' | 'subscriptionExpiresAt'>;

export function hasActiveSubscription(professional: SubscriptionFields): boolean {
	const { subscriptionStatus: status, subscriptionExpiresAt: expiresAt } = professional;
	if (status === 'trial') return true;
	if (status !== 'active') return false;
	return expiresAt == null || expiresAt.getTime() > Date.now();
}

export const SUBSCRIPTION_BLOCKED_MESSAGE =
	'Sua assinatura não está ativa. Renove em Assinatura pra continuar gerando planos.';
