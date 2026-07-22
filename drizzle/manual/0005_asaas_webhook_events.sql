-- Inbox idempotente de webhooks do Asaas (billing).
-- Aplicada manualmente (drizzle-kit generate travando em prompt de drift;
-- mesma convenção das manuais anteriores). Ver schema.ts: asaasWebhookEvents.
CREATE TABLE IF NOT EXISTS "asaas_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asaas_event_id" text NOT NULL,
	"event" text NOT NULL,
	"payment_id" text,
	"payload" jsonb NOT NULL,
	"professional_id" uuid,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "asaas_webhook_events_asaas_event_id_unique" UNIQUE("asaas_event_id"),
	CONSTRAINT "asaas_webhook_events_professional_id_professionals_id_fk"
		FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id")
		ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "asaas_events_received_idx"
	ON "asaas_webhook_events" ("received_at");

-- RLS: tabela é só do servidor (service role / conexão direta). Nega client.
ALTER TABLE "asaas_webhook_events" ENABLE ROW LEVEL SECURITY;
