import { eq, inArray } from 'drizzle-orm'
import { Decimal } from 'decimal.js'
import { productClasses } from '../../product/schemas'
import { shippingMethods } from '../../order/schemas'
import { calculateTax, TaxService } from '../../tax/services/tax'
import { CartContent, Database } from '../../types'

// Prices cart content that already has its offers applied: line prices, tax
// and totals. Used for both the cart summary and order creation, so the total
// a customer sees is the total they are charged.
const priceCart = async (
  db: Database,
  content: CartContent,
  shippingMethodId?: number,
) => {
  let shippingMethod: typeof shippingMethods.$inferSelect | undefined
  if (shippingMethodId !== undefined) {
    ;[shippingMethod] = await db
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.id, shippingMethodId))
    if (!shippingMethod) {
      throw new Error(`Shipping method not found: ${shippingMethodId}`)
    }
  }

  const taxSettings = await new TaxService(db).getSettings()
  const classIds = [
    ...new Set(
      content.lines
        .map((line) => line.product.productClassId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const classRates = new Map(
    classIds.length
      ? (
          await db
            .select({ id: productClasses.id, taxRate: productClasses.taxRate })
            .from(productClasses)
            .where(inArray(productClasses.id, classIds))
        ).map((productClass) => [productClass.id, productClass.taxRate])
      : [],
  )

  const lines = content.lines.map((line) => {
    const listPrice = line.product.price
    const salePrice = line.product.discountedPrice
    const price = listPrice ?? salePrice ?? null
    const discount =
      listPrice && salePrice ? new Decimal(listPrice).sub(salePrice) : new Decimal(0)
    // Taxed on what the customer pays for the line, after its offer discounts
    const taxable = Decimal.max(
      new Decimal(price ?? 0).sub(discount).mul(line.quantity).sub(line.totalOfferDiscount),
      0,
    )
    const taxRate =
      (line.product.productClassId !== null
        ? classRates.get(line.product.productClassId)
        : null) ?? taxSettings.defaultRate
    return {
      cartLineId: line.id,
      productId: line.productId,
      productName: line.product.name,
      productSku: line.product.sku,
      price,
      discount: discount.toString(),
      tax: calculateTax(taxable, taxRate, taxSettings.pricesIncludeTax).toString(),
      taxRate,
      quantity: line.quantity,
    }
  })

  const offerDiscount = new Decimal(content.totalOfferDiscount)
  const shippingCharge = new Decimal(shippingMethod?.price ?? 0)
  // A line without any price counts as zero
  const subtotal = lines.reduce(
    (sum, line) =>
      sum.add(new Decimal(line.price ?? 0).sub(line.discount).mul(line.quantity)),
    new Decimal(0),
  )
  const shippingTax = taxSettings.taxShipping
    ? calculateTax(shippingCharge, taxSettings.defaultRate, taxSettings.pricesIncludeTax)
    : new Decimal(0)
  const tax = lines.reduce((sum, line) => sum.add(line.tax), shippingTax)
  // Tax-inclusive prices already contain the tax
  const total = subtotal
    .sub(offerDiscount)
    .add(shippingCharge)
    .add(taxSettings.pricesIncludeTax ? 0 : tax)

  return {
    lines,
    shippingMethod,
    pricesIncludeTax: taxSettings.pricesIncludeTax,
    subtotal: subtotal.toString(),
    offerDiscount: offerDiscount.toString(),
    shippingCharge: shippingCharge.toString(),
    tax: tax.toString(),
    total: total.toString(),
  }
}

export { priceCart }
