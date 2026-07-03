-- ════════════════════════════════════════════════════════════════════
-- Busca de catálogo insensível a acento.
-- searchExerciseCatalog (queries.ts) usa extensions.unaccent(...) pra que
-- "biceps"/"quadriceps" (sem acento) achem "Bíceps"/"Quadríceps". Sem isso,
-- o seed de grupo muscular e a digitação sem acento devolviam poucos/zero
-- resultados. Idempotente.
-- ════════════════════════════════════════════════════════════════════
create extension if not exists unaccent with schema extensions;
