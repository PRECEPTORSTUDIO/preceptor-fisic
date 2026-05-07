# Operações — Preceptor Fisic

Guia de runbooks pra rotinas de produção: backup, restore, deploy, rollback, debugging.

---

## 1. Backup

### Automático (Supabase)
O Supabase faz backup automático **diário** com retenção:
- **Free tier**: 7 dias (pra teste, não pra produção real)
- **Pro tier**: 30 dias com PITR (Point-in-Time Recovery)

Acesse em: Supabase Dashboard → Project → Database → Backups.

### Manual / Off-site (recomendado pré-launch)

Pra ter cópia física fora do Supabase:

```bash
# Dump completo do schema + dados
pg_dump --no-owner --no-acl --clean --if-exists \
  --dbname="$DATABASE_URL_DIRECT" \
  --file="backup-$(date +%Y%m%d-%H%M).sql"

# Compactar
gzip backup-*.sql

# Upload pra storage off-site (S3, R2, drive, etc)
# ex: rclone copy backup-*.sql.gz remote:preceptor-backups/
```

Recomendação: **rotina semanal** dump off-site enquanto não estiver em Supabase Pro.

### Exportar dados de um aluno (LGPD direito de portabilidade)

```sql
-- Em psql conectado ao DATABASE_URL_DIRECT
SELECT row_to_json(s) FROM (
  SELECT
    students.*,
    health_profiles.*,
    training_preferences.*,
    (SELECT jsonb_agg(tp) FROM training_plans tp WHERE tp.student_id = students.id) AS plans,
    (SELECT jsonb_agg(ts) FROM training_sessions ts WHERE ts.student_id = students.id) AS sessions,
    (SELECT jsonb_agg(pa) FROM physical_assessments pa WHERE pa.student_id = students.id) AS assessments
  FROM students
  LEFT JOIN health_profiles ON health_profiles.student_id = students.id
  LEFT JOIN training_preferences ON training_preferences.student_id = students.id
  WHERE students.id = '<UUID-DO-ALUNO>'
) s;
```

---

## 2. Restore

### Restore completo (DB inteiro)

```bash
# Drop + recreate (perigoso!)
psql "$DATABASE_URL_DIRECT" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restaurar
gunzip -c backup-XXXXXXXX-XXXX.sql.gz | psql "$DATABASE_URL_DIRECT"

# Re-rodar migrations pra garantir que está atualizado
npm run db:migrate
```

### Restore parcial (uma tabela)

```bash
pg_dump --table=students --table=health_profiles \
  --dbname="$DATABASE_URL_DIRECT" --file=partial.sql

# Edita o arquivo se precisar e aplica:
psql "$DATABASE_URL_DIRECT" < partial.sql
```

### Point-In-Time Recovery (Supabase Pro)

Dashboard → Database → Backups → escolher timestamp → Restore.
Tipicamente leva 5-15 min. App fica indisponível durante o restore.

---

## 3. Deploy

### Production deploy
```bash
# 1. Garante que main tá limpo + tests passam
git status
npm run test

# 2. Push pra main → GitHub Actions roda CI
git push origin main

# 3. Vercel detecta push e deploya automaticamente
# OU manualmente:
vercel deploy --prod --yes
```

Latest deploys: `vercel ls` ou https://vercel.com/matheus-castros-projects-3aec77a2/preceptor-fisic

### Preview deploy (PRs)
Vercel cria preview automaticamente em todo push de branch != main.
URL fica visível no PR como comentário do bot Vercel.

---

## 4. Rollback

### Rollback rápido (Vercel)
```bash
# Lista deploys
vercel ls

# Promove um deploy anterior pra production
vercel rollback <deployment-url> --yes
```

Tempo: ~10 segundos. Não toca DB.

### Rollback de DB (migration ruim)

```bash
# Se uma migration corrompeu dados:
# 1. Restore PITR pro momento ANTES da migration
# 2. Reverte o commit da migration
git revert <migration-commit>

# 3. Push + redeploy
git push origin main
```

---

## 5. Debugging produção

### Logs em tempo real
```bash
# Stream logs do deploy atual
vercel logs --follow

# Logs de um deploy específico
vercel logs <deployment-url>
```

### Sentry (errors 5xx)
Dashboard: https://sentry.io → preceptor-fisic
Errors aparecem com stack trace + breadcrumbs (sem PII clínica).

### Plausible (analytics + funnel)
https://plausible.io/preceptor-fisic.vercel.app

### Supabase logs
Dashboard → Logs → API/Postgres/Auth.

---

## 6. Quotas e limites

| Resource | Limite | Onde monitorar |
|---|---|---|
| Vercel function execution | 1M / mês (Hobby) | Dashboard → Usage |
| Supabase DB rows | 500MB (Free) → 8GB (Pro) | Dashboard → Settings → Usage |
| Gemini 2.5 Flash | 15 RPM, 1M TPM (Free) | https://aistudio.google.com/u/0/usage |
| Resend emails | 100/dia (Free) → 3000 (Pro) | resend.com → Logs |
| Sentry events | 5k errors / mês (Free) | sentry.io → Stats |
| Plausible | 10k pageviews / mês (Hobby) | plausible.io → Settings |

### Rate limit interno
- `/alunos/[id]/gerar`: **5 planos / 5 min** por professional (em `queries.countPlansGeneratedRecent`)

---

## 7. Incidente: o que fazer

1. **App está fora do ar?**
   - Status Vercel: https://www.vercel-status.com
   - Status Supabase: https://status.supabase.com
   - Se ambos OK: rollback do último deploy

2. **Erros 500 em massa?**
   - Sentry → últimos eventos
   - `vercel logs --follow`
   - Se Gemini estourou quota: Pro vira fallback automático no generator

3. **DB devagar?**
   - Supabase Dashboard → Database → Query Performance
   - Pode estar faltando index — checar `EXPLAIN ANALYZE`

4. **Vazamento de dados / acesso indevido?**
   - Bloquear acesso ao Supabase via IP allowlist
   - Reset de service_role_key
   - Comunicar ANPD em 72h (LGPD art. 48)
   - Comunicar titulares afetados

---

## 8. Checklist pré-launch público

- [ ] Supabase Pro tier (PITR + backup 30d)
- [ ] Custom domain configurado (preceptorfisic.com)
- [ ] Resend domain verificado (não usar onboarding@resend.dev)
- [ ] `RESEND_FROM` apontando pra noreply@dominio
- [ ] `PUBLIC_SENTRY_DSN` + `SENTRY_DSN` setadas
- [ ] `PUBLIC_PLAUSIBLE_DOMAIN` setado
- [ ] Política de Privacidade + Termos revisados por advogado
- [ ] DPO contact email (`dpo@preceptorfisic.com`) recebendo
- [ ] Backup off-site rodando (cron job semanal)
- [ ] Smoke E2E rodando em CI verde
- [ ] Página de status / incidentes (statuspage / similar)
- [ ] Plano de comunicação de incidente documentado
