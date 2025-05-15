ALTER TABLE "payment_event" ADD COLUMN "createdAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_event" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;