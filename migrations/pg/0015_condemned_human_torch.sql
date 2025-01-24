CREATE TABLE "shipping_address" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"country" text,
	"country_code" text,
	"line_1" text,
	"line_2" text,
	"city" text,
	"house_no" text,
	"province" text,
	"postal_code" text,
	"instructions" text,
	"isDefault" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
