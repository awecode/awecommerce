DO $$ BEGIN
 CREATE TYPE "public"."cart_status" AS ENUM('Open', 'Frozen', 'Cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "cart" ADD COLUMN "status" "cart_status" DEFAULT 'Open';