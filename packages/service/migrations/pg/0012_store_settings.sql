CREATE TABLE "store_setting" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL
);
