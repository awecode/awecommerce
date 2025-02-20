ALTER TABLE "cart_line" DROP CONSTRAINT "cart_line_productId_product_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;