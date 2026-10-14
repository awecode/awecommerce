ALTER TABLE "product" ADD COLUMN "customFields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_line" ADD COLUMN "customizations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "customizations" jsonb DEFAULT '{}'::jsonb NOT NULL;