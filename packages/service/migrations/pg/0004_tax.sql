CREATE TABLE "tax_setting" (
	"id" serial PRIMARY KEY NOT NULL,
	"pricesIncludeTax" boolean DEFAULT false NOT NULL,
	"defaultRate" numeric(100, 20) DEFAULT '0' NOT NULL,
	"taxShipping" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_class" ADD COLUMN "taxRate" numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "taxRate" numeric(100, 20);