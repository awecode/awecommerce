CREATE TABLE "product_view" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer,
	"userId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_view" ADD CONSTRAINT "product_view_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;