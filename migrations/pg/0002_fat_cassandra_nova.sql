ALTER TABLE "product" ALTER COLUMN "price" SET DATA TYPE numeric(100);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "discountedPrice" numeric(100);--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "inventoryCost" numeric(100);