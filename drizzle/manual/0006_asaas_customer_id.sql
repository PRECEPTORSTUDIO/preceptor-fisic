-- Assinatura de dentro do app: professional ↔ customer Asaas.
ALTER TABLE "professionals" ADD COLUMN IF NOT EXISTS "asaas_customer_id" text;
ALTER TABLE "professionals"
	ADD CONSTRAINT "professionals_asaas_customer_id_unique" UNIQUE ("asaas_customer_id");
