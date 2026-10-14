import { NotFoundError, ValidationError } from '../../../core/errors'
import { eq, inArray } from 'drizzle-orm'
import { Decimal } from 'decimal.js'
import { productClasses } from '../../product/schemas'
import { shippingMethods } from '../../order/schemas'
import { hasFreeShipping } from '../../offer/services/offer'
import { calculateTax, TaxService } from '../../tax/services/tax'
import { CartContent, Database } from '../../types'

// Prices cart content that already has its offers applied: line prices, tax
// and totals. Used for both the cart summary and order creation, so the total
// a customer sees is the total they are charged.
const priceCart = async (
  db: Database,
  content: CartContent,
  shippingMethodId?: number,
  // Value of redeemed loyalty points. Reduces the products only, not shipping.
  loyaltyDiscount: Decimal.Value = 0,
) => {
  let shippingMethod: typeof shippingMethods.$inferSelect | undefined
  if (shippingMethodId !== undefined) {
    ;[shippingMethod] = await db
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.id, shippingMethodId))
    if (!shippingMethod) {
      throw new NotFoundError(`Shipping method not found: ${shippingMethodId}`)
    }
  }

  const taxSettings = await new TaxService(db).getSettings()
  const classIds = [
    ...new Set(
      content.lines
        .map((line) => line.variant.product.productClassId)
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

  // What each line costs after its sale price and offer discounts
  const lineAmounts = content.lines.map((line) => {
    const listPrice = line.variant.price
    const salePrice = line.variant.discountedPrice
    const price = listPrice ?? salePrice ?? null
    const discount =
      listPrice && salePrice ? new Decimal(listPrice).sub(salePrice) : new Decimal(0)
    const amount = Decimal.max(
      new Decimal(price ?? 0).sub(discount).mul(line.quantity).sub(line.totalOfferDiscount),
      0,
    )
    return { price, discount, amount }
  })

  // Spread the loyalty discount across lines in proportion to their amounts,
  // so each line is taxed at its own rate on what is left. The last line with
  // an amount takes the remainder, so the shares add up exactly.
  const loyalty = new Decimal(loyaltyDiscount)
  const productsTotal = lineAmounts.reduce((sum, line) => sum.add(line.amount), new Decimal(0))
  if (loyalty.gt(productsTotal)) {
    throw new ValidationError("Points are worth more than the order's products")
  }
  const lastIndex = lineAmounts.map((line) => line.amount.gt(0)).lastIndexOf(true)
  let loyaltyLeft = loyalty
  const loyaltyShares = lineAmounts.map((line, index) => {
    if (loyalty.isZero() || line.amount.isZero()) {
      return new Decimal(0)
    }
    const share =
      index === lastIndex ? loyaltyLeft : loyalty.mul(line.amount).div(productsTotal)
    loyaltyLeft = loyaltyLeft.sub(share)
    return share
  })

  const lines = content.lines.map((line, index) => {
    const { price, discount, amount } = lineAmounts[index]
    // Taxed on what the customer pays for the line
    const taxable = amount.sub(loyaltyShares[index])
    const { variant } = line
    const { product } = variant
    const taxRate =
      (product.productClassId !== null
        ? classRates.get(product.productClassId)
        : null) ?? taxSettings.defaultRate
    return {
      cartLineId: line.id,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantTitle: variant.title,
      sku: variant.sku,
      imageUrl: variant.image?.imageUrl ?? product.thumbnail,
      options: variant.options,
      customizations: line.customizations,
      price,
      discount: discount.toString(),
      tax: calculateTax(taxable, taxRate, taxSettings.pricesIncludeTax).toString(),
      taxRate,
      quantity: line.quantity,
    }
  })

  const offerDiscount = new Decimal(content.totalOfferDiscount)
  // A free shipping offer waives the charge; the order still records the method
  const shippingCharge = hasFreeShipping(content)
    ? new Decimal(0)
    : new Decimal(shippingMethod?.price ?? 0)
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
    .sub(loyalty)
    .add(shippingCharge)
    .add(taxSettings.pricesIncludeTax ? 0 : tax)

  return {
    lines,
    shippingMethod,
    pricesIncludeTax: taxSettings.pricesIncludeTax,
    subtotal: subtotal.toString(),
    offerDiscount: offerDiscount.toString(),
    loyaltyDiscount: loyalty.toString(),
    shippingCharge: shippingCharge.toString(),
    tax: tax.toString(),
    total: total.toString(),
  }
}

export { priceCart }
