import { NotFoundError, ValidationError } from '../../../core/errors'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  optionValuesWithOption,
  withVariantOptions,
} from '../../product/services/product'
import { CustomField, products, productVariants } from '../../product/schemas'
import {
  cartAppliedVoucherOffers,
  CartLine,
  cartLines,
  carts,
  NewCartLine,
} from '../schemas'
import { OfferService } from '../../offer/services/offer'
import { offers } from '../../offer/schemas'
import { CartContent, CartContentWithoutOfferInfo, Database } from '../../types'
import { priceCart } from './pricing'
import { LoyaltyService } from '../../loyalty/services/loyalty'

const SUM_PRODUCT_QUANTITY_ON_CART_MERGE = true

// Checks the buyer's answers against the product's custom fields. Returns them
// trimmed, without empty optional answers, so equal answers always match.
const validateCustomizations = (
  fields: CustomField[],
  answers: Record<string, unknown>,
) => {
  const labels = new Set(fields.map((field) => field.label))
  for (const label of Object.keys(answers)) {
    if (!labels.has(label)) {
      throw new ValidationError(`Unknown field: ${label}`)
    }
  }
  const customizations: Record<string, string> = {}
  for (const field of fields) {
    const answer = answers[field.label]
    if (answer !== undefined && typeof answer !== 'string') {
      throw new ValidationError(`Field must be text: ${field.label}`)
    }
    const text = (answer ?? '').trim()
    if (!text) {
      if (field.required) {
        throw new ValidationError(`Missing required field: ${field.label}`)
      }
      continue
    }
    if (text.length > field.maxLength) {
      throw new ValidationError(
        `Field is too long: ${field.label} (max ${field.maxLength} characters)`,
      )
    }
    customizations[field.label] = text
  }
  return customizations
}

// Why saved answers no longer fit the product's current custom fields, or null
// when they still do
const customizationsError = (
  fields: CustomField[],
  answers: Record<string, string>,
) => {
  try {
    validateCustomizations(fields, answers)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

// Whether two sets of answers are the same, in any key order
const sameCustomizations = (
  a: Record<string, string>,
  b: Record<string, string>,
) => {
  const sorted = (answers: Record<string, string>) =>
    JSON.stringify(Object.entries(answers).sort(([x], [y]) => x.localeCompare(y)))
  return sorted(a) === sorted(b)
}

// Cart lines are the same when they have the same variant and answers
const sameLine = (
  a: { variantId: number; customizations: Record<string, string> },
  b: { variantId: number; customizations: Record<string, string> },
) => a.variantId === b.variantId && sameCustomizations(a.customizations, b.customizations)

// Loads a cart line's variant with what pricing and the order snapshot need
const lineVariant = {
  variant: {
    with: {
      product: true,
      image: true,
      optionValues: optionValuesWithOption,
    },
  },
} as const

const withLineVariant = <
  L extends { variant: Parameters<typeof withVariantOptions>[0] },
>(
  line: L,
) => ({ ...line, variant: withVariantOptions(line.variant) })

// Whether buyers can buy the variant: it, and its product, are active, and the
// product is published
const isForSale = (
  variant: { isActive: boolean },
  product: { isActive: boolean | null; status: string | null },
) => variant.isActive && product.isActive === true && product.status === 'Published'

class CartService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(userId?: string) {
    const result = await this.db.insert(carts).values({ userId }).returning()
    return result[0]
  }

  // Adds a variant with the buyer's answers to the product's custom fields. The
  // same variant with the same answers adds to that line's quantity; different
  // answers make a separate line.
  async addToCart(
    cartId: number,
    variantId: number,
    quantity: number,
    answers: Record<string, string> = {},
  ) {
    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1')
    }
    const [row] = await this.db
      .select({ variant: productVariants, product: products })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, variantId))
    const variant = row?.variant
    if (!variant) {
      throw new NotFoundError(`Product variant not found: ${variantId}`)
    }
    if (!isForSale(variant, row.product)) {
      throw new ValidationError(`Product variant is not available: ${variantId}`)
    }
    if (!variant.discountedPrice && !variant.price) {
      throw new ValidationError('Product price not found')
    }
    const customizations = validateCustomizations(row.product.customFields, answers)

    // One statement, so simultaneous adds of the same item cannot make two lines
    const result = await this.db
      .insert(cartLines)
      .values({
        cartId,
        variantId,
        quantity,
        customizations,
      })
      .onConflictDoUpdate({
        target: [cartLines.cartId, cartLines.variantId, cartLines.customizations],
        set: { quantity: sql`${cartLines.quantity} + excluded."quantity"` },
      })
      .returning()

    return result[0]
  }

  // Replaces the buyer's answers on a line, for example after checkout or the
  // cart summary reports they no longer fit the product's fields. If another
  // line already has the new answers, this line's quantity moves onto it.
  async updateCustomizations(
    cartId: number,
    cartLineId: number,
    answers: Record<string, string>,
  ) {
    return await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ line: cartLines, customFields: products.customFields })
        .from(cartLines)
        .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
        .for('update', { of: cartLines })
      if (!row) {
        throw new NotFoundError(`Cart line not found: ${cartLineId}`)
      }
      const { line } = row
      const customizations = validateCustomizations(row.customFields, answers)

      const [matching] = await tx
        .select()
        .from(cartLines)
        .where(
          and(
            eq(cartLines.cartId, cartId),
            eq(cartLines.variantId, line.variantId),
            eq(cartLines.customizations, customizations),
            ne(cartLines.id, line.id),
          ),
        )
        .for('update')
      if (matching) {
        await tx.delete(cartLines).where(eq(cartLines.id, line.id))
        const [merged] = await tx
          .update(cartLines)
          .set({ quantity: sql`${cartLines.quantity} + ${line.quantity}` })
          .where(eq(cartLines.id, matching.id))
          .returning()
        return merged
      }

      const [updated] = await tx
        .update(cartLines)
        .set({ customizations, updatedAt: new Date().toISOString() })
        .where(eq(cartLines.id, line.id))
        .returning()
      return updated
    })
  }

  async updateQuantity(cartId: number, cartLineId: number, quantity: number) {
    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1')
    }
    const result = await this.db
      .update(cartLines)
      .set({ quantity })
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Cart line not found: ${cartLineId}`)
    }
    return result[0]
  }

  async removeFromCart(cartId: number, cartLineId: number) {
    const result = await this.db
      .delete(cartLines)
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Cart line not found: ${cartLineId}`)
    }
    return result[0]
  }

  async clearCart(cartId: number) {
    return await this.db.transaction(async (tx) => {
      const cartService = new CartService(tx)
      await tx
        .delete(cartLines)
        .where(eq(cartLines.cartId, cartId))
        .returning()
      await cartService.resetAppliedVoucherOffers(cartId)
    })
  }

  async getCartForSession(sessionId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.createdAt))
    return result[0]
  }

  async getCartForUser(userId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.createdAt))
    return result[0]
  }

  // Cart content with offers applied, tax per line and the totals the customer
  // will be charged at checkout. Pass the shipping method they picked to
  // include shipping and its tax.
  async getCartSummary(
    sessionId: string,
    options: { shippingMethodId?: number; redeemPoints?: number } = {},
  ) {
    const content = await this.getCartContentForSession(sessionId, true)
    // Previews the points' value; they are only redeemed at checkout
    const loyaltyDiscount =
      options.redeemPoints !== undefined
        ? await new LoyaltyService(this.db).redemptionValue(
            content.userId,
            options.redeemPoints,
          )
        : 0
    const pricing = await priceCart(
      this.db,
      content,
      options.shippingMethodId,
      loyaltyDiscount,
    )
    return {
      ...content,
      lines: content.lines.map((line, index) => ({
        ...line,
        tax: pricing.lines[index].tax,
        taxRate: pricing.lines[index].taxRate,
        // Checkout fails while this is set; the buyer needs to update the line
        customizationsError: customizationsError(
          line.variant.product.customFields,
          line.customizations,
        ),
      })),
      subtotal: pricing.subtotal,
      loyaltyDiscount: pricing.loyaltyDiscount,
      shippingCharge: pricing.shippingCharge,
      tax: pricing.tax,
      total: pricing.total,
      pricesIncludeTax: pricing.pricesIncludeTax,
    }
  }

  async getCartContentForSession(
    sessionId: string,
    withOffersInfo = false,
  ): Promise<CartContent> {
    const content = await this.db.query.carts.findFirst({
      with: {
        lines: {
          with: lineVariant,
          orderBy: asc(cartLines.createdAt),
        },
        appliedVoucherOffers: {
          with: {
            offer: {
              with: {
                benefit: true,
                condition: true,
              },
            },
          },
        },
      },
      where: eq(carts.sessionId, sessionId),
    })
    if(!content) {
      throw new NotFoundError(`Cart not found for session: ${sessionId}`)
    }
    const {appliedVoucherOffers, ...rest} = content
    let cartContent: CartContent = {
      ...rest,
      lines: rest.lines.map((line) => ({
        ...withLineVariant(line),
        siteOfferDiscounts: [],
        userOfferDiscounts: [],
        voucherOfferDiscounts: [],
        totalOfferDiscount: 0,
      })),
      siteOfferDiscounts: [],
      userOfferDiscounts: [],
      voucherOfferDiscounts: [],
      totalOfferDiscount: 0,
    }
    if (withOffersInfo) {
      cartContent = await this.applySiteOffers(cartContent)
      if (cartContent.userId) {
        cartContent = await this.applyUserOffers(
          cartContent,
          cartContent.userId,
        )
      }
      cartContent = await this.db.transaction(async (tx) => {
        let content = cartContent
        await new CartService(tx).resetAppliedVoucherOffers(content.id)
        for (const appliedOffer of appliedVoucherOffers) {
          try {
            // A savepoint per voucher, so a database error while applying one
            // does not abort the transaction and drop the others
            content = await tx.transaction((savepoint) =>
              new OfferService(savepoint).applyVoucherCode(
                content,
                appliedOffer.offer,
                undefined,
                content.userId || undefined,
              ),
            )
          } catch (e) {
            console.error(e)
          }
        }
        return content
      })
    }
    return cartContent
  }

  async mergeCarts(
    userId: string,
    sessionId: string,
    sumProductQuantityOnCartMerge: boolean = SUM_PRODUCT_QUANTITY_ON_CART_MERGE,
  ): Promise<CartContentWithoutOfferInfo> {
    return await this.db.transaction(async (tx) => {
      const cartService = new CartService(tx)
      // const userCart = await this.db
      //   .select({
      //     cart: carts,
      //     lines: sql<CartLine[]>`json_agg(${cartLines})`,
      //   })
      //   .from(carts)
      //   .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      //   .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      //   .groupBy(carts.id)
      //   .orderBy(desc(carts.updatedAt));
      const userCart = await tx.query.carts.findFirst({
        with: {
          lines: {
            with: lineVariant,
          },
        },
        where: eq(carts.userId, userId),
        orderBy: desc(carts.updatedAt),
      })
      if (!userCart) {
        const result = await tx
          .update(carts)
          .set({ userId })
          .where(eq(carts.sessionId, sessionId))
          .returning()
        if (!result.length) {
          return {
            ...(await cartService.create(userId)),
            lines: [],
          }
        }
        return await cartService.getCartContentForSession(result[0].sessionId) as CartContentWithoutOfferInfo
      }
      // const sessionCart = await this.db
      //   .select({
      //     cart: carts,
      //     lines: sql<CartLine[]>`json_agg(${cartLines})`,
      //   })
      //   .from(carts)
      //   .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      //   .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      //   .groupBy(carts.id)
      //   .orderBy(desc(carts.updatedAt));
      const sessionCart = await tx.query.carts.findFirst({
        with: {
          lines: {
            with: lineVariant,
          },
        },
        where: eq(carts.sessionId, sessionId),
        orderBy: desc(carts.createdAt),
      })
      if (!sessionCart) {
        return { ...userCart, lines: userCart.lines.map(withLineVariant) }
      }

      const lines: NewCartLine[] = []
      for (const userLine of userCart.lines) {
        const sessionLine = sessionCart.lines.find((l: CartLine) =>
          sameLine(l, userLine),
        )
        if (sessionLine) {
          lines.push({
            cartId: sessionCart.id,
            variantId: sessionLine.variantId,
            customizations: sessionLine.customizations,
            id: sessionLine.id,
            quantity: sumProductQuantityOnCartMerge
              ? userLine.quantity + sessionLine.quantity
              : sessionLine.quantity,
          })
        } else {
          lines.push({
            cartId: sessionCart.id,
            variantId: userLine.variantId,
            customizations: userLine.customizations,
            quantity: userLine.quantity,
          })
        }
      }

      for (const sessionLine of sessionCart.lines) {
        if (!userCart.lines.find((l: CartLine) => sameLine(l, sessionLine))) {
          lines.push({
            id: sessionLine.id,
            cartId: sessionLine.cartId,
            variantId: sessionLine.variantId,
            customizations: sessionLine.customizations,
            quantity: sessionLine.quantity,
            createdAt: sessionLine.createdAt,
            updatedAt: sessionLine.updatedAt,
          })
        }
      }

      let insertedLines: CartLine[] = []
      if (lines.length) {
        insertedLines = await tx
          .insert(cartLines)
          .values(lines)
          .onConflictDoUpdate({
            target: cartLines.id,
            set: {
              quantity: sql`excluded.quantity`,
            },
          })
          .returning()
      }

      await tx
        .update(carts)
        .set({ status: 'Merged' })
        .where(eq(carts.id, userCart.id))

      await tx
        .update(carts)
        .set({ userId })
        .where(eq(carts.sessionId, sessionId))

      sessionCart.userId = userId

      const insertedLinesWithVariant = await tx.query.cartLines.findMany({
        where: inArray(cartLines.id, insertedLines.map(l => l.id)),
        with: lineVariant,
      })

      return {
        ...sessionCart,
        lines: insertedLinesWithVariant.map(withLineVariant),
      }
    })
  }

  async unApplyVoucherOffer(cartId: number, offerId: number) {
    await this.db
      .delete(cartAppliedVoucherOffers)
      .where(
        and(
          eq(cartAppliedVoucherOffers.cartId, cartId),
          eq(cartAppliedVoucherOffers.offerId, offerId),
        ),
      )
  }

  async unapplyVoucherCode(sessionId: string, voucherCode: string) {
    const rowsToDelete = await this.db
      .select({
        cartId: cartAppliedVoucherOffers.cartId,
        offerId: cartAppliedVoucherOffers.offerId,
      })
      .from(cartAppliedVoucherOffers)
      .innerJoin(carts, eq(cartAppliedVoucherOffers.cartId, carts.id))
      .innerJoin(offers, eq(cartAppliedVoucherOffers.offerId, offers.id))
      .where(
        and(
          eq(carts.sessionId, sessionId),
          eq(offers.voucherCode, voucherCode),
        ),
      );

    if (!rowsToDelete.length) {
      return
    }

    await this.db
      .delete(cartAppliedVoucherOffers)
      .where(
        and(
          inArray(cartAppliedVoucherOffers.offerId, rowsToDelete.map(r => r.offerId)),
          eq(cartAppliedVoucherOffers.cartId, rowsToDelete[0].cartId),
        ),
      );
  }

  async resetAppliedVoucherOffers(cartId: number) {
    await this.db
      .delete(cartAppliedVoucherOffers)
      .where(eq(cartAppliedVoucherOffers.cartId, cartId))
  }

  // Site offers apply to every cart, guests included
  async applySiteOffers(cartContent: CartContent) {
    const offerService = new OfferService(this.db)
    let offers = await offerService.getActiveUserOffers(cartContent.userId, {
      type: 'site',
    })
    offers = offers.filter((offer) => offer.benefit?.isActive)
    for (const offer of offers) {
      cartContent = await offerService.applyUserOffer(offer, cartContent, 'site')
    }
    return cartContent
  }

  async applyUserOffers(cartContent: CartContent, userId: string) {
    const offerService = new OfferService(this.db)
    let offers = await offerService.getActiveUserOffers(userId)
    offers = offers.filter((offer) => offer.benefit?.isActive)
    for (const offer of offers) {
      cartContent = await offerService.applyUserOffer(offer, cartContent)
    }
    return cartContent
  }
}

export { CartService, customizationsError, isForSale }
