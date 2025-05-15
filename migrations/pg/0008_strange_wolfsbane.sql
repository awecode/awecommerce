ALTER TABLE "brand" ADD COLUMN "isActive" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "isActive" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "product_class" ADD COLUMN "isActive" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "isTodaysDeal" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "isActive" boolean DEFAULT true;