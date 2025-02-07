CREATE TYPE "public"."offer_benefit_type" AS ENUM('fixed_amount', 'percentage', 'free_shipping', 'fixed_price');--> statement-breakpoint
CREATE TYPE "public"."offer_condition_type" AS ENUM('basket_quantity', 'basket_total', 'distinct_items');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('site', 'product', 'service');--> statement-breakpoint
CREATE TABLE "offer_application_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"offerId" integer NOT NULL,
	"orderId" integer NOT NULL,
	"userId" text,
	"createdAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offer_benefit" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true,
	"type" "offer_benefit_type" NOT NULL,
	"value" integer NOT NULL,
	"maxAffectedItems" integer,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offer_condition" (
	"id" serial PRIMARY KEY NOT NULL,
	"rangeId" integer,
	"type" "offer_condition_type" NOT NULL,
	"value" integer NOT NULL,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
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
	"includeAllProducts" boolean DEFAULT false,
	"inclusiveFilter" boolean DEFAULT false,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"type" "offer_type" NOT NULL,
	"voucherCode" text,
	"conditionId" integer,
	"benefitId" integer,
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"isActive" boolean DEFAULT true,
	"isFeatured" boolean DEFAULT false,
	"priority" integer DEFAULT 0,
	"limitPerUser" integer,
	"overallLimit" integer,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "offer_application_log" ADD CONSTRAINT "offer_application_log_offerId_offer_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."offer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_application_log" ADD CONSTRAINT "offer_application_log_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_condition" ADD CONSTRAINT "offer_condition_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product" ADD CONSTRAINT "offer_range_excluded_product_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_excluded_product" ADD CONSTRAINT "offer_range_excluded_product_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_brand" ADD CONSTRAINT "offer_range_included_brand_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_brand" ADD CONSTRAINT "offer_range_included_brand_brandId_brand_id_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_category" ADD CONSTRAINT "offer_range_included_category_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_category" ADD CONSTRAINT "offer_range_included_category_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product_class" ADD CONSTRAINT "offer_range_included_product_class_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product_class" ADD CONSTRAINT "offer_range_included_product_class_productClassId_product_class_id_fk" FOREIGN KEY ("productClassId") REFERENCES "public"."product_class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product" ADD CONSTRAINT "offer_range_included_product_rangeId_offer_range_id_fk" FOREIGN KEY ("rangeId") REFERENCES "public"."offer_range"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_range_included_product" ADD CONSTRAINT "offer_range_included_product_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_conditionId_offer_condition_id_fk" FOREIGN KEY ("conditionId") REFERENCES "public"."offer_condition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_benefitId_offer_benefit_id_fk" FOREIGN KEY ("benefitId") REFERENCES "public"."offer_benefit"("id") ON DELETE no action ON UPDATE no action;