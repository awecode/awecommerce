CREATE TYPE "public"."product_status" AS ENUM('Draft', 'Published');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('Open', 'Frozen', 'Cancelled', 'Merged');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('Pending', 'Confirmed', 'Processing', 'Processed', 'Couriered', 'Shipped', 'Delivered', 'Returned', 'Cancelled', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('Paid', 'Refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('Pending', 'Paid', 'Refunded');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('Requested', 'Success', 'Failed', 'Cancelled', 'Error', 'Disproved', 'Refunded');--> statement-breakpoint
CREATE TYPE "public"."offer_benefit_type" AS ENUM('fixed_amount', 'percentage', 'free_shipping', 'fixed_price');--> statement-breakpoint
CREATE TYPE "public"."offer_condition_type" AS ENUM('basket_quantity', 'basket_total', 'distinct_items');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('site', 'voucher', 'user');--> statement-breakpoint
CREATE TYPE "public"."loyalty_log_type" AS ENUM('earned', 'redeemed', 'unredeemed');--> statement-breakpoint
CREATE TABLE "brand" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"description" text,
	"order" integer DEFAULT 1,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "brand_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parentId" integer,
	"description" text,
	"logo" text,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_class" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"trackStock" boolean DEFAULT true,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "product_class_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_image" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer,
	"imageUrl" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_related_products" (
	"productId" integer,
	"relatedProductId" integer,
	CONSTRAINT "product_related_products_productId_relatedProductId_pk" PRIMARY KEY("productId","relatedProductId")
);
--> statement-breakpoint
CREATE TABLE "product_view" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer,
	"userId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sku" text NOT NULL,
	"description" text,
	"specification" text,
	"brandId" integer,
	"categoryId" integer,
	"productClassId" integer,
	"link" text,
	"thumbnail" text,
	"price" numeric(100, 20),
	"discountedPrice" numeric(100, 20),
	"inventoryCost" numeric(100, 20),
	"status" "product_status" DEFAULT 'Draft',
	"stockQuantity" integer DEFAULT 0,
	"isFeatured" boolean DEFAULT false,
	"isBestSeller" boolean DEFAULT false,
	"isActive" boolean DEFAULT true,
	"extraInfo" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "product_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "cart_applied_offer" (
	"cartId" integer NOT NULL,
	"offerId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cart_applied_offer_cartId_offerId_pk" PRIMARY KEY("cartId","offerId")
);
--> statement-breakpoint
CREATE TABLE "cart_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"cartId" integer NOT NULL,
	"productId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text,
	"sessionId" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"status" "cart_status" DEFAULT 'Open' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cart_sessionId_unique" UNIQUE("sessionId")
);
--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"productId" integer NOT NULL,
	"price" numeric(100, 20) NOT NULL,
	"discount" numeric(100, 20) DEFAULT '0' NOT NULL,
	"tax" numeric(100, 20) DEFAULT '0' NOT NULL,
	"quantity" integer NOT NULL,
	"status" "order_status" DEFAULT 'Pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"log" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"loggedBy" text
);
--> statement-breakpoint
CREATE TABLE "order_status_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"previousStatus" "order_status" NOT NULL,
	"newStatus" "order_status" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" text
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text,
	"guestUser" jsonb,
	"cartId" integer,
	"status" "order_status" DEFAULT 'Pending' NOT NULL,
	"paymentStatus" "payment_status" DEFAULT 'Pending' NOT NULL,
	"shippingAddress" jsonb DEFAULT '{}'::jsonb,
	"shippingMethod" jsonb DEFAULT '{}'::jsonb,
	"offers" jsonb DEFAULT '[]'::jsonb,
	"discount" numeric(100, 20) DEFAULT '0' NOT NULL,
	"loyaltyDiscount" numeric(100, 20) DEFAULT '0' NOT NULL,
	"shippingCharge" numeric(100, 20) DEFAULT '0' NOT NULL,
	"tax" numeric(100, 20) DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"cancelledBy" text,
	"cancelledAt" timestamp with time zone,
	"cancellationReason" text,
	"cancellationRemarks" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"amount" numeric(100, 20) NOT NULL,
	"type" "payment_event_type" DEFAULT 'Paid' NOT NULL,
	"reference" text,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_address" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"country" text,
	"countryCode" text,
	"line1" text,
	"line2" text,
	"city" text,
	"houseNo" text,
	"province" text,
	"postalCode" text,
	"instructions" text,
	"isDefault" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_method" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(100, 20) NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer,
	"gateway" text NOT NULL,
	"reference" text,
	"amount" numeric(100, 20) NOT NULL,
	"status" "transaction_status" DEFAULT 'Requested' NOT NULL,
	"metadata" jsonb,
	"lastRequestedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "loyalty_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"orderId" integer NOT NULL,
	"points" numeric(100, 20) NOT NULL,
	"type" "loyalty_log_type" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_point" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"orderId" integer NOT NULL,
	"earnedPoints" numeric(100, 20) NOT NULL,
	"redeemedPoints" numeric(100, 20) DEFAULT '0' NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_setting" (
	"id" serial PRIMARY KEY NOT NULL,
	"isEnabled" boolean DEFAULT false,
	"earnRate" numeric(100, 20),
	"redeemRate" numeric(100, 20),
	"expiresAfterInDays" integer
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parentId_category_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_relatedProductId_product_id_fk" FOREIGN KEY ("relatedProductId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_view" ADD CONSTRAINT "product_view_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brandId_brand_id_fk" FOREIGN KEY ("brandId") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_productClassId_product_class_id_fk" FOREIGN KEY ("productClassId") REFERENCES "public"."product_class"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_applied_offer" ADD CONSTRAINT "cart_applied_offer_cartId_cart_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_applied_offer" ADD CONSTRAINT "cart_applied_offer_offerId_offer_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_cartId_cart_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_productId_product_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_change" ADD CONSTRAINT "order_status_change_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cartId_cart_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "offer" ADD CONSTRAINT "offer_benefitId_offer_benefit_id_fk" FOREIGN KEY ("benefitId") REFERENCES "public"."offer_benefit"("id") ON DELETE no action ON UPDATE no action;