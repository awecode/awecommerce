ALTER TABLE "order_line" DROP CONSTRAINT "order_line_orderId_order_id_fk";
--> statement-breakpoint
ALTER TABLE "order_log" DROP CONSTRAINT "order_log_orderId_order_id_fk";
--> statement-breakpoint
ALTER TABLE "order_status_change" DROP CONSTRAINT "order_status_change_orderId_order_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_event" DROP CONSTRAINT "payment_event_orderId_order_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_orderId_order_id_fk";
--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_change" ADD CONSTRAINT "order_status_change_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;