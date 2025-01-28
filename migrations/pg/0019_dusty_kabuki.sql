CREATE TABLE "order_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"log" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;