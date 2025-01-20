ALTER TABLE "brand" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "brand" ALTER COLUMN "slug" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "slug" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "product_class" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "product_class" ALTER COLUMN "slug" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "product_image" ALTER COLUMN "imageUrl" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "link" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "thumbnail" SET DATA TYPE varchar(256);