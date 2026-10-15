CREATE TYPE "public"."membership_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"program" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "membership_plan_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "membership_term" (
	"id" serial PRIMARY KEY NOT NULL,
	"planId" integer NOT NULL,
	"variantId" integer NOT NULL,
	"months" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	CONSTRAINT "membership_term_variantId_unique" UNIQUE("variantId")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"planId" integer NOT NULL,
	"months" integer NOT NULL,
	"pricePaid" numeric(100, 20),
	"startsAt" timestamp with time zone NOT NULL,
	"endsAt" timestamp with time zone NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"orderId" integer,
	"grantedBy" text,
	"cancelledAt" timestamp with time zone,
	"cancellationReason" text,
	"createdAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "includedMembershipPlanIds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "combinesWithOtherOffers" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_planId_membership_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."membership_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_variantId_product_variant_id_fk" FOREIGN KEY ("variantId") REFERENCES "public"."product_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_planId_membership_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;