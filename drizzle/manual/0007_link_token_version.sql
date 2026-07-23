-- Versão do magic-link por aluno (ver src/lib/server/aluno-token.ts).
-- Incrementar revoga só o link daquele aluno, sem trocar o secret global.
-- Idempotente.
ALTER TABLE students
	ADD COLUMN IF NOT EXISTS link_token_version integer NOT NULL DEFAULT 1;
