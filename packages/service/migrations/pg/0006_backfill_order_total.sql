-- Custom SQL migration file, put your code below! --
-- Fills in the total of orders created before the column existed, with the
-- same formula as checkout. Orders do not record whether prices included tax,
-- so the current store setting is used (orders from before tax have tax 0).
UPDATE "order" SET "total" =
  COALESCE((
    SELECT SUM((COALESCE(line."price", 0) - line."discount") * line."quantity")
    FROM "order_line" line
    WHERE line."orderId" = "order"."id"
  ), 0)
  - "order"."discount"
  - "order"."loyaltyDiscount"
  + "order"."shippingCharge"
  + CASE
      WHEN COALESCE((SELECT "pricesIncludeTax" FROM "tax_setting" LIMIT 1), false) THEN 0
      ELSE "order"."tax"
    END
WHERE "total" IS NULL;
