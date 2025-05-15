ALTER TYPE "public"."order_status" ADD VALUE 'Confirmed' BEFORE 'Processing';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'Processed' BEFORE 'Couriered';