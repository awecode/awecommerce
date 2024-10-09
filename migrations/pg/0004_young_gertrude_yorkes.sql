ALTER TABLE "cart" ADD COLUMN "sessionId" uuid DEFAULT uuid_generate_v4() NOT NULL;--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_sessionId_unique" UNIQUE("sessionId");