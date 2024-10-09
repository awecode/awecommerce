ALTER TABLE "product" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "specification" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "stockQuantity" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "isFeatured" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "isBestSeller" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "relatedProducts" integer;--> statement-breakpoint
ALTER TABLE "product_class" ADD COLUMN "trackStock" boolean DEFAULT true;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product" ADD CONSTRAINT "product_relatedProducts_product_id_fk" FOREIGN KEY ("relatedProducts") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
