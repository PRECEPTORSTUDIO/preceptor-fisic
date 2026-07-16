/**
 * Audit log de ações sensíveis. Append-only via RLS no Supabase.
 *
 * Registra:
 *   - delete/restore aluno
 *   - publicar/arquivar plano
 *   - alteração de email/senha
 *   - acesso ao perfil de outro aluno (se RLS for burlado, fica gravado)
 *   - rate-limit hits
 *   - login/logout/signup/reset
 *
 * Não bloqueia operação se write falha — é fire-and-forget com log de erro.
 */
import { db } from './db';
import { auditLog } from './db/schema';
import { logger } from './logger';

export type AuditAction =
	| 'student.create'
	| 'student.update'
	| 'student.delete'
	| 'student.restore'
	| 'student.magic_link_resent'
	| 'plan.create'
	| 'plan.publish'
	| 'plan.archive'
	| 'plan.unarchive'
	| 'plan.restriction_override'
	| 'plan.delete'
	| 'plan.rate_limited'
	| 'professional.create'
	| 'professional.update'
	| 'auth.login'
	| 'auth.logout'
	| 'auth.signup'
	| 'auth.password_reset_request'
	| 'auth.password_changed'
	| 'auth.mfa_enrolled'
	| 'appointment.create'
	| 'appointment.update'
	| 'appointment.cancel'
	| 'assessment.create'
	| 'health.cv_risk_updated';

export type AuditOpts = {
	action: AuditAction;
	professionalId?: string | null;
	entityType: string;
	entityId?: string | null;
	payload?: Record<string, unknown>;
	ipAddress?: string | null;
	userAgent?: string | null;
	correlationId?: string | null;
};

/**
 * Grava no audit_log. Não throws — falha de audit não derruba flow.
 */
export async function audit(opts: AuditOpts): Promise<void> {
	try {
		await db.insert(auditLog).values({
			professionalId: opts.professionalId ?? null,
			action: opts.action,
			entityType: opts.entityType,
			entityId: opts.entityId ?? null,
			payload: opts.payload ?? null,
			ipAddress: opts.ipAddress ?? null,
			userAgent: opts.userAgent ?? null,
			correlationId: opts.correlationId ?? null
		});
	} catch (err) {
		logger.error({ err: String(err).slice(0, 200), action: opts.action }, 'audit.write_failed');
	}
}

/**
 * Helper pra extrair IP + user agent do RequestEvent.
 */
export function clientFingerprint(request: Request, getClientAddress?: () => string) {
	let ipAddress: string | null = null;
	try {
		ipAddress =
			request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
			request.headers.get('x-real-ip') ??
			(getClientAddress ? getClientAddress() : null);
	} catch {
		/* ignore */
	}
	const userAgent = request.headers.get('user-agent')?.slice(0, 200) ?? null;
	return { ipAddress, userAgent };
}
