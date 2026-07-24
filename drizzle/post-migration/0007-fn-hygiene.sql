-- Higiene dos advisors do Supabase: funções de trigger não precisam ser
-- executáveis via REST/RPC por anon/authenticated. Triggers seguem
-- funcionando (privilégio é checado no CREATE TRIGGER, não no disparo).
-- is_owner_professional fica de fora: é chamada pelas policies de RLS no
-- contexto do usuário autenticado (revogar quebraria as policies).
-- Idempotente. Já aplicado em produção em 2026-07-22 via MCP.
REVOKE EXECUTE ON FUNCTION public.auto_confirm_email() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
