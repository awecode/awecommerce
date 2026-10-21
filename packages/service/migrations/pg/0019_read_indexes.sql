CREATE INDEX "product_image_productId_idx" ON "product_image" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "product_variant_productId_idx" ON "product_variant" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "cart_userId_idx" ON "cart" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "order_line_orderId_idx" ON "order_line" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "order_userId_idx" ON "order" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "membership_term_planId_idx" ON "membership_term" USING btree ("planId");--> statement-breakpoint
CREATE INDEX "membership_userId_idx" ON "membership" USING btree ("userId");