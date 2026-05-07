# Preceptor Fisic — v3

> Plataforma de prescrição clínica para profissionais CREF/CREFITO. Reescrita do zero a partir do FisioMentor v2 — região Brasil (sa-east-1) + design system fit-tech dark.

**Stack:** SvelteKit 2 · Svelte 5 (runes) · Tailwind 4 · Drizzle ORM · Supabase (Postgres + pgvector + Auth) · Vercel AI SDK · Vercel (`gru1`).

---

## Setup

Requer **Node 20+** e **pnpm 10+**.

```bash
pnpm install
cp .env.example .env.local
# preencher .env.local com chaves do Supabase BR
pnpm dev
# http://localhost:5173
```

Sem `.env.local`, o app roda em **modo design** — `/dashboard` e `/alunos/[id]` ficam acessíveis sem auth, com dados mock. Quando você plugar o Supabase, o auth guard ativa automaticamente.

## Design system — Preceptor Fisic

Direção: **Whoop / Eight Sleep / Linear**. Dark mode protagonista. Lavanda como única cor vibrante. Geist + Geist Mono.

### Regras inegociáveis

1. **Dark mode sempre.** Surfaces `#050505 → #2D2D2D`.
2. **Lavanda (`#A78BFA`) é a única cor vibrante.** Usar com parcimônia.
3. **Geist (sans) + Geist Mono.** Toda UI em Geist, todo número/label/código em Geist Mono.
4. **Todo número usa mono + `tabular-nums`.** Se você escreveu um número em sans, está errado.
5. **Use `var(--token)` sempre.** Tokens em [`src/app.css`](src/app.css). Nunca hex inline.
6. **Reutilize primitives em [`src/lib/components/ui/`](src/lib/components/ui/).** Não duplique.
7. **Sem emoji decorativo, sem gradientes coloridos, sem ornamentos.** Glow do accent (sutil) é a única exceção.

### Tokens-chave

| | |
|---|---|
| Surfaces | `bg-0` `#050505` → `bg-5` `#2D2D2D` |
| Ink | `ink-0` `#FAFAFA` → `ink-3` `#4D4D4D` |
| Lines | `ink-line` `#2A2A2A` · `ink-line-2` `#383838` |
| Accent | `accent` `#A78BFA` · `accent-wash` `rgba(167,139,250,.08)` |
| Semantic | `success` `#34D399` · `warn` `#FBBF24` · `danger` `#F87171` · `info` `#60A5FA` |
| Type sans | `display-md` 36 · `headline` 24 · `title-lg` 20 · `body` 14 · `body-sm` 13 |
| Type mono | `num-xl` 56 · `num-lg` 36 · `num-md` 24 · `label-mono` 11 |
| Radii | `r-1` 6 · `r-2` 12 · `r-3` 16 · `r-pill` 999 |

### Primitives prontos (`src/lib/components/ui/`)

- `Eyebrow`, `Button`, `Ring`, `Metric`, `Chip`, `Avatar`, `StatusDot`, `Sparkline`, `ProgressBar`

### Layout (`src/lib/components/layout/`)

- `Sidebar` — nav 240px com search, badges, active indicator lavanda

## Telas implementadas

- `/login` — split layout com gradient + form
- `/dashboard` — visão geral: 4 stat cards, heatmap de atividade, lista de alunos com filtros
- `/alunos/[id]` — ficha com hero (avatar grande + 5 stats), 3 abas (Dados / Planos / Progresso)

## Banco de dados — migração v2 → v3 (US → BR)

1. **Crie projeto Supabase em `sa-east-1`** (São Paulo) no dashboard
2. **Habilite pgvector** no SQL Editor:
   ```sql
   create extension if not exists vector;
   ```
3. **Dump do projeto v2** (US):
   ```bash
   pg_dump --no-owner --no-privileges \
     "postgresql://postgres.XXX:PASS@aws-X-us-east-1.pooler.supabase.com:5432/postgres" \
     > fisiomentor-v2.dump.sql
   ```
4. **Restore no projeto BR**:
   ```bash
   psql "postgresql://postgres.YYY:PASS@aws-1-sa-east-1.pooler.supabase.com:5432/postgres" \
     < fisiomentor-v2.dump.sql
   ```
5. **Cole as novas chaves** em `.env.local` (URL, anon key, service role, DATABASE_URL com porta 6543, DATABASE_URL_DIRECT com porta 5432).
6. **Reuse** a mesma `GOOGLE_GENERATIVE_AI_API_KEY` da v2 — Gemini é stateless.

## Roadmap

- [x] Foundation: scaffold + tokens + 9 primitives + Sidebar
- [x] Telas-hero: Login, Dashboard, StudentFicha
- [ ] Telas restantes: Planos, Exercicios, Mensagens, Agenda, GerarTreino, PlanoDetail, SessionDetail, Avaliacao, Settings
- [ ] App do aluno (mobile, dentro de iOS frame)
- [ ] Auth flows reais (Supabase signIn/signOut)
- [ ] Migrar dados v2 → BR
- [ ] RAG ingestion + clinical rules engine

## Estrutura

```
src/
  app.html, app.css (tokens), app.d.ts, hooks.server.ts
  lib/
    components/
      ui/        primitives (Button, Ring, Metric, …)
      layout/    Sidebar, NavIcon
    server/
      db/        schema.ts (fonte única) + drizzle client
    data/        sample-students.ts (mock até banco BR)
    utils/cn.ts
  routes/
    +layout.svelte         (root, importa app.css)
    +page.server.ts        (redirect)
    (public)/login/        Login
    (app)/                 (sidebar shell + auth guard)
      dashboard/           Visão geral
      alunos/[id]/         Ficha do aluno
```

---

## CI / Email / Operações

### GitHub Actions
PRs e push pra `main` rodam automaticamente:
- `npm run test` — vitest unit (10 testes)
- `npm run check` — svelte-check de tipos
- `npm run test:e2e` — Playwright smoke (6 testes, só em routes/lib touches)

Ver `.github/workflows/ci.yml`.

### Email transactional (Resend)
Configure `RESEND_API_KEY` em `.env.local` (e em Vercel) pra ativar:
- Magic-link automático ao criar aluno (se aluno tem email)
- Reenvio manual via ação na ficha do aluno
- Boas-vindas pro profissional após signup
- Notificação quando plano IA fica pronto

Sem a env var, helpers em `src/lib/server/email.ts` logam warnings e o fluxo continua sem quebrar — bom pra dev local.

### Rate limit
`/alunos/[id]/gerar` tem limite de 5 planos a cada 5 minutos por professional.
Implementado em `queries.ts:countPlansGeneratedRecent`. Protege quota Gemini.

### Recuperar senha
Fluxo completo via Supabase: `/recuperar` → email → `/recuperar/redefinir`.

