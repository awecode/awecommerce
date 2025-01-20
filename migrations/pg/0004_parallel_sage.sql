CREATE TABLE IF NOT EXISTS "product_related_products" (
	"productId" integer,
	"relatedProductId" integer,
	CONSTRAINT "product_related_products_productId_relatedProductId_pk" PRIMARY KEY("productId","relatedProductId")
);
--> statement-breakpoint
ALTER TABLE "product" DROP CONSTRAINT "product_relatedProducts_product_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_relatedProductId_product_id_fk" FOREIGN KEY ("relatedProductId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN IF EXISTS "relatedProducts";