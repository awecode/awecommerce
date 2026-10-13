CREATE TABLE "product_option_value" (
	"id" serial PRIMARY KEY NOT NULL,
	"optionId" integer NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "product_option_value_optionId_value_unique" UNIQUE("optionId","value")
);
--> statement-breakpoint
CREATE TABLE "product_option" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "product_option_productId_name_unique" UNIQUE("productId","name")
);
--> statement-breakpoint
CREATE TABLE "product_variant_option_value" (
	"variantId" integer NOT NULL,
	"optionValueId" integer NOT NULL,
	CONSTRAINT "product_variant_option_value_variantId_optionValueId_pk" PRIMARY KEY("variantId","optionValueId")
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"sku" text NOT NULL,
	"title" text,
	"price" numeric(100, 20),
	"discountedPrice" numeric(100, 20),
	"inventoryCost" numeric(100, 20),
	"stockQuantity" integer DEFAULT 0,
	"imageId" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "product_variant_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "product" DROP CONSTRAINT "product_sku_unique";--> statement-breakpoint
ALTER TABLE "cart_line" ADD COLUMN "variantId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "variantId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "variantTitle" text;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "sku" text NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "imageUrl" text;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_option_value" ADD CONSTRAINT "product_option_value_optionId_product_option_id_fk" FOREIGN KEY ("optionId") REFERENCES "public"."product_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option" ADD CONSTRAINT "product_option_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_value" ADD CONSTRAINT "product_variant_option_value_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_option_value" ADD CONSTRAINT "product_variant_option_value_optionValueId_product_option_value_id_fk" FOREIGN KEY ("optionValueId") REFERENCES "public"."product_option_value"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_imageId_product_image_id_fk" FOREIGN KEY ("imageId") REFERENCES "public"."product_image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "sku";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "discountedPrice";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "inventoryCost";--> statement-breakpoint
ALTER TABLE "product" DROP COLUMN "stockQuantity";--> statement-breakpoint
ALTER TABLE "cart_line" DROP CONSTRAINT "cart_line_productId_product_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_line" DROP COLUMN "productId";--> statement-breakpoint
ALTER TABLE "order_line" DROP COLUMN "productSku";