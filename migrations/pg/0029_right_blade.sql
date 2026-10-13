ALTER TABLE "transaction" ALTER COLUMN "orderId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brand" ADD COLUMN "order" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "order_log" ADD COLUMN "loggedBy" text;--> statement-breakpoint
ALTER TABLE "order_status_change" ADD COLUMN "createdBy" text;