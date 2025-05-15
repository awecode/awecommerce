CREATE TYPE "public"."order_status" AS ENUM('Pending', 'Processing', 'Couriered', 'Shipped', 'Delivered', 'Returned', 'Cancelled', 'Completed');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('Paid', 'Refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('Pending', 'Paid', 'Refunded');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('Requested', 'Success', 'Failed', 'Cancelled', 'Error', 'Disproved', 'Refunded');--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"productId" integer NOT NULL,
	"price" numeric NOT NULL,
	"discount" numeric DEFAULT '0' NOT NULL,
	"tax" numeric DEFAULT '0' NOT NULL,
	"quantity" integer NOT NULL,
	"status" "order_status" DEFAULT 'Pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"previousStatus" "order_status" NOT NULL,
	"newStatus" "order_status" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text,
	"guestUser" jsonb,
	"cartId" integer NOT NULL,
	"status" "order_status" DEFAULT 'Pending' NOT NULL,
	"paymentStatus" "payment_status" DEFAULT 'Pending' NOT NULL,
	"shippingAddress" jsonb DEFAULT '{}'::jsonb,
	"shippingMethod" jsonb DEFAULT '{}'::jsonb,
	"discount" numeric DEFAULT '0' NOT NULL,
	"tax" numeric DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"cancelledBy" text,
	"cancelledAt" timestamp with time zone,
	"cancellationReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"amount" numeric NOT NULL,
	"type" "payment_event_type" DEFAULT 'Paid' NOT NULL,
	"reference" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "shipping_method" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"gateway" text NOT NULL,
	"reference" text,
	"amount" numeric NOT NULL,
	"status" "transaction_status" DEFAULT 'Requested' NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastRequestedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cart_line" ALTER COLUMN "cartId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_line" ALTER COLUMN "productId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cart" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_change" ADD CONSTRAINT "order_status_change_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cartId_cart_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;