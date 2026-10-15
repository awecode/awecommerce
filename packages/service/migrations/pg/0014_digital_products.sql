ALTER TABLE "product_class" ADD COLUMN "requiresShipping" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "requiresShipping" boolean DEFAULT true NOT NULL;