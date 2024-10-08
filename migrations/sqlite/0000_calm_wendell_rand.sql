CREATE TABLE `brand` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (current_timestamp),
	`updatedAt` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`parentId` integer,
	`description` text,
	`createdAt` text DEFAULT (current_timestamp),
	`updatedAt` text DEFAULT (current_timestamp),
	FOREIGN KEY (`parentId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_class` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (current_timestamp),
	`updatedAt` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE TABLE `product_image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productId` integer,
	`imageUrl` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp),
	`updatedAt` text DEFAULT (current_timestamp),
	FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`brandId` integer,
	`categoryId` integer,
	`productClassId` integer,
	`link` text,
	`thumbnail` text,
	`price` integer NOT NULL,
	`status` text DEFAULT 'Draft',
	`createdAt` text DEFAULT (current_timestamp),
	`updatedAt` text DEFAULT (current_timestamp),
	FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`productClassId`) REFERENCES `product_class`(`id`) ON UPDATE no action ON DELETE no action
);
