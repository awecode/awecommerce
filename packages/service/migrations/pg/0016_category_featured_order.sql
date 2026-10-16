ALTER TABLE "category" ADD COLUMN "isFeatured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "order" integer DEFAULT 1;