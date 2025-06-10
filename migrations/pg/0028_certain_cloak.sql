CREATE TYPE "public"."offer_benefit_type" AS ENUM('fixed_amount', 'percentage', 'free_shipping', 'fixed_price');--> statement-breakpoint
CREATE TYPE "public"."offer_condition_type" AS ENUM('basket_quantity', 'basket_total', 'distinct_items');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('site', 'voucher', 'user');--> statement-breakpoint
CREATE TABLE "cart_applied_offer" (
	"cartId" integer NOT NULL,
	"offerId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cart_applied_offer_cartId_offerId_pk" PRIMARY KEY("cartId","offerId")
);
--> statement-breakpoint
CREATE TABLE "offer_application_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"offerId" integer,
	"orderId" integer,
	"userId" text,
	"remarks" text,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offer_benefit" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true,
	"type" "offer_benefit_type" NOT NULL,
	"value" numeric(100, 20) NOT NULL,
	"maxAffectedItems" integer,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offer_condition" (
	"id" serial PRIMARY KEY NOT NULL,
	"rangeId" integer NOT NULL,
	"type" "offer_condition_type" NOT NULL,
	"value" numeric(100, 20) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offer_range_excluded_brand" (
	"rangeId" integer,
	"brandId" integer,
	CONSTRAINT "offer_range_excluded_brand_rangeId_brandId_pk" PRIMARY KEY("rangeId","brandId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_excluded_category" (
	"rangeId" integer,
	"categoryId" integer,
	CONSTRAINT "offer_range_excluded_category_rangeId_categoryId_pk" PRIMARY KEY("rangeId","categoryId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_excluded_product_class" (
	"rangeId" integer,
	"productClassId" integer,
	CONSTRAINT "offer_range_excluded_product_class_rangeId_productClassId_pk" PRIMARY KEY("rangeId","productClassId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_excluded_product" (
	"rangeId" integer,
	"productId" integer,
	CONSTRAINT "offer_range_excluded_product_rangeId_productId_pk" PRIMARY KEY("rangeId","productId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_included_brand" (
	"rangeId" integer,
	"brandId" integer,
	CONSTRAINT "offer_range_included_brand_rangeId_brandId_pk" PRIMARY KEY("rangeId","brandId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_included_category" (
	"rangeId" integer,
	"categoryId" integer,
	CONSTRAINT "offer_range_included_category_rangeId_categoryId_pk" PRIMARY KEY("rangeId","categoryId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_included_product_class" (
	"rangeId" integer,
	"productClassId" integer,
	CONSTRAINT "offer_range_included_product_class_rangeId_productClassId_pk" PRIMARY KEY("rangeId","productClassId")
);
--> statement-breakpoint
CREATE TABLE "offer_range_included_product" (
	"rangeId" integer,
	"productId" integer,
	CONSTRAINT "offer_range_included_product_rangeId_productId_pk" PRIMARY KEY("rangeId","productId")
);
--> statement-breakpoint
CREATE TABLE "offer_range" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true,
	"inclusiveFilter" boolean DEFAULT false,
	"includeAllProducts" boolean DEFAULT false,
	"includeAllCategories" boolean DEFAULT false,
	"includeAllBrands" boolean DEFAULT false,
	"includeAllProductClasses" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offer_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"offerId" integer,
	"userId" text,
	"usageCount" integer DEFAULT 1,
	CONSTRAINT "offer_usage_offerId_userId_unique" UNIQUE("offerId","userId")
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"type" "offer_type" NOT NULL,
	"voucherCode" text,
	"includeAllUsers" boolean DEFAULT false,
	"includedUserIds" jsonb DEFAULT '[]'::jsonb,
	"conditionId" integer NOT NULL,
	"benefitId" integer NOT NULL,
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"isActive" boolean DEFAULT true,
	"isFeatured" boolean DEFAULT false,
	"priority" integer DEFAULT 0,
	"limitPerUser" integer,
	"overallLimit" integer,
	"usageCount" integer DEFAULT 0,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "offer_voucherCode_unique" UNIQUE("voucherCode")
);
--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "price" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "discountedPrice" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "inventoryCost" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order_line" ALTER COLUMN "price" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order_line" ALTER COLUMN "discount" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order_line" ALTER COLUMN "tax" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "cartId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "discount" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "tax" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "payment_event" ALTER COLUMN "amount" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "shipping_method" ALTER COLUMN "price" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "amount" SET DATA TYPE numeric(100, 20);--> statement-breakpoint
ALTER TABLE "brand" ADD COLUMN "order" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "subCategoryId" integer;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "offers" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "loyaltyDiscount" numeric(100, 20) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shippingCharge" numeric(100, 20) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_applied_offer" ADD CONSTRAINT "cart_applied_offer_cartId_cart_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_applied_offer" ADD CONSTRAINT "cart_applied_offer_offerId_offer_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_condition" ADD CONSTRAINT "offer_condition_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_brand" ADD CONSTRAINT "offer_range_excluded_brand_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_brand" ADD CONSTRAINT "offer_range_excluded_brand_brandId_brand_id_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_category" ADD CONSTRAINT "offer_range_excluded_category_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_category" ADD CONSTRAINT "offer_range_excluded_category_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product_class" ADD CONSTRAINT "offer_range_excluded_product_class_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product_class" ADD CONSTRAINT "offer_range_excluded_product_class_productClassId_product_class_id_fk" FOREIGN KEY ("productClassId") REFERENCES "public"."product_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product" ADD CONSTRAINT "offer_range_excluded_product_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product" ADD CONSTRAINT "offer_range_excluded_product_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_brand" ADD CONSTRAINT "offer_range_included_brand_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_brand" ADD CONSTRAINT "offer_range_included_brand_brandId_brand_id_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_category" ADD CONSTRAINT "offer_range_included_category_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_category" ADD CONSTRAINT "offer_range_included_category_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product_class" ADD CONSTRAINT "offer_range_included_product_class_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product_class" ADD CONSTRAINT "offer_range_included_product_class_productClassId_product_class_id_fk" FOREIGN KEY ("productClassId") REFERENCES "public"."product_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product" ADD CONSTRAINT "offer_range_included_product_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product" ADD CONSTRAINT "offer_range_included_product_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_conditionId_offer_condition_id_fk" FOREIGN KEY ("conditionId") REFERENCES "public"."offer_condition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_benefitId_offer_benefit_id_fk" FOREIGN KEY ("benefitId") REFERENCES "public"."offer_benefit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_subCategoryId_category_id_fk" FOREIGN KEY ("subCategoryId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "cart_line" DROP COLUMN "originalPrice";