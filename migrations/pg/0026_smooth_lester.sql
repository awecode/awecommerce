ALTER TABLE "product_image" DROP CONSTRAINT "product_image_productId_product_id_fk";
--> statement-breakpoint
ALTER TABLE "product_related_products" DROP CONSTRAINT "product_related_products_productId_product_id_fk";
--> statement-breakpoint
ALTER TABLE "product_related_products" DROP CONSTRAINT "product_related_products_relatedProductId_product_id_fk";
--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_relatedProductId_product_id_fk" FOREIGN KEY ("relatedProductId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;