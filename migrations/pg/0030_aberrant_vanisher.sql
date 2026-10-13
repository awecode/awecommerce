CREATE TYPE "public"."loyalty_log_type" AS ENUM('earned', 'redeemed', 'unredeemed');--> statement-breakpoint
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
