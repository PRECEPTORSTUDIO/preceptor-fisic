CREATE TYPE "public"."lead_source" AS ENUM('instagram', 'indicacao', 'anuncio', 'site', 'whatsapp', 'outro');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('novo', 'contatado', 'trial_agendado', 'trial_realizado', 'convertido', 'perdido');--> statement-breakpoint
CREATE TABLE "exercise_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text NOT NULL,
	"body_part" text NOT NULL,
	"target_muscle" text NOT NULL,
	"secondary_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" text,
	"difficulty" text,
	"category" text,
	"instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions_en" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"video_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_catalog_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professional_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"source" "lead_source" DEFAULT 'outro' NOT NULL,
	"stage" "lead_stage" DEFAULT 'novo' NOT NULL,
	"notes" text,
	"next_follow_up_at" timestamp with time zone,
	"converted_student_id" uuid,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_plans" ADD COLUMN "stream_text" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_student_id_students_id_fk" FOREIGN KEY ("converted_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_catalog_external_idx" ON "exercise_catalog" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "exercise_catalog_body_part_idx" ON "exercise_catalog" USING btree ("body_part");--> statement-breakpoint
CREATE INDEX "exercise_catalog_target_idx" ON "exercise_catalog" USING btree ("target_muscle");--> statement-breakpoint
CREATE INDEX "exercise_catalog_name_en_idx" ON "exercise_catalog" USING btree ("name_en");--> statement-breakpoint
CREATE INDEX "leads_pro_stage_idx" ON "leads" USING btree ("professional_id","stage");--> statement-breakpoint
CREATE INDEX "leads_pro_followup_idx" ON "leads" USING btree ("professional_id","next_follow_up_at");--> statement-breakpoint
CREATE INDEX "leads_pro_created_idx" ON "leads" USING btree ("professional_id","created_at");