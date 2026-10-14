-- Custom SQL migration file, put your code below! --
-- Merges duplicate cart lines (same cart, variant and answers) into the oldest
-- one, adding up their quantities, so the unique index on them can be created.
UPDATE "cart_line" AS keep
SET "quantity" = duplicates."total"
FROM (
  SELECT MIN("id") AS "id", SUM("quantity") AS "total"
  FROM "cart_line"
  GROUP BY "cartId", "variantId", "customizations"
  HAVING COUNT(*) > 1
) AS duplicates
WHERE keep."id" = duplicates."id";--> statement-breakpoint
DELETE FROM "cart_line" AS extra
USING "cart_line" AS keep
WHERE extra."cartId" = keep."cartId"
  AND extra."variantId" = keep."variantId"
  AND extra."customizations" = keep."customizations"
  AND extra."id" > keep."id";
