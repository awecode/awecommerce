import { NotFoundError, ValidationError } from '../../../core/errors'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import {
  listedProduct,
  optionValuesWithOption,
  ProductService,
  ProductVariantService,
  withVariantOptions,
} from '../../product/services/product'
import { CustomField, productClasses, products, productVariants } from '../../product/schemas'
import {
  cartAppliedVoucherOffers,
  CartLine,
  cartLines,
  carts,
  NewCartLine,
} from '../schemas'
import { OfferService, withoutOffers } from '../../offer/services/offer'
import { offers } from '../../offer/schemas'
import { CartContent, CartContentWithoutOfferInfo, Database } from '../../types'
import { priceCart } from './pricing'
import { LoyaltyService } from '../../loyalty/services/loyalty'
import { MembershipService } from '../../membership/services/membership'
import { membershipPlans, membershipTerms } from '../../membership/schemas'
import { OwnershipService } from '../../order/services/ownership'

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
  // answers make a separate line. Something a person buys one of (see
  // OwnershipService) is added once, with quantity 1, replacing its line: a
  // membership term replaces the cart's lines of its program (any of its plans
  // and terms), as a person holds one plan of a program at a time. A once per
  // person variant the cart's user already owns is refused.
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
      .select({
        variant: productVariants,
        product: products,
        listed: sql<boolean>`${listedProduct}`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, variantId))
    const variant = row?.variant
    if (!variant) {
      throw new NotFoundError(`Product variant not found: ${variantId}`)
    }
    // Only active variants of products the store shows
    if (!variant.isActive || !row.listed) {
      throw new ValidationError(`Product variant is not available: ${variantId}`)
    }
    if (!variant.discountedPrice && !variant.price) {
      throw new ValidationError('Product price not found')
    }
    const customizations = validateCustomizations(row.product.customFields, answers)
    const ownership = new OwnershipService(this.db)
    const single = (await ownership.singleVariants([variantId])).get(variantId)
    if (single) {
      if (quantity !== 1) {
        throw new ValidationError(`Only one ${row.product.name} can be bought`)
      }
      const [cart] = await this.db.select({ userId: carts.userId }).from(carts).where(eq(carts.id, cartId))
      if ((await ownership.ownedVariants(cart?.userId, [variantId])).has(variantId)) {
        throw new ValidationError(`You already own ${row.product.name}`)
      }
      const term = single === 'membership' ? (await new MembershipService(this.db).termsForVariants([variantId])).get(variantId) : undefined
      return await this.db.transaction(async (tx) => {
        await tx.delete(cartLines).where(
          and(
            eq(cartLines.cartId, cartId),
            term
              ? inArray(cartLines.variantId, this.programVariants(tx, term.plan.program))
              : eq(cartLines.variantId, variantId),
          ),
        )
        await new ProductVariantService(tx).checkStock(new Map([[variantId, quantity]]))
        const [line] = await tx.insert(cartLines).values({ cartId, variantId, quantity, customizations }).returning()
        return line
      })
    }
    // Counts the variant's other lines in the cart too
    await new ProductVariantService(this.db).checkStock(
      new Map([[variantId, (await this.quantityInCart(cartId, variantId)) + quantity]]),
    )

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

  // The variants that sell a plan of this membership program
  private programVariants(db: Database, program: string) {
    return db
      .select({ id: membershipTerms.variantId })
      .from(membershipTerms)
      .innerJoin(membershipPlans, eq(membershipPlans.id, membershipTerms.planId))
      .where(eq(membershipPlans.program, program))
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
    const [line] = await this.db
      .select()
      .from(cartLines)
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
    if (!line) {
      throw new NotFoundError(`Cart line not found: ${cartLineId}`)
    }
    if (quantity > 1 && (await new OwnershipService(this.db).singleVariants([line.variantId])).has(line.variantId)) {
      throw new ValidationError('Only one of this can be bought')
    }
    await new ProductVariantService(this.db).checkStock(
      new Map([[line.variantId, (await this.quantityInCart(cartId, line.variantId)) - line.quantity + quantity]]),
    )
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

  // How many of the variant the cart holds, over all its lines
  private async quantityInCart(cartId: number, variantId: number) {
    const [{ quantity }] = await this.db
      .select({ quantity: sql<number>`COALESCE(SUM(${cartLines.quantity}), 0)::int` })
      .from(cartLines)
      .where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)))
    return quantity
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
    const variantIds = content.lines.map((line) => line.variantId)
    const ownership = new OwnershipService(this.db)
    // Each of these needs only the content, so they run at once
    const [pricing, listedIds, stock, terms, [singles, owned]] = await Promise.all([
      (async () => {
        // Previews the points' value; they are only redeemed at checkout
        const loyaltyDiscount =
          options.redeemPoints !== undefined
            ? await new LoyaltyService(this.db).redemptionValue(
                content.userId,
                options.redeemPoints,
              )
            : 0
        return await priceCart(this.db, content, options.shippingMethodId, loyaltyDiscount)
      })(),
      new ProductService(this.db)
        .listedProductIds(content.lines.map((line) => line.variant.productId))
        .then((ids) => new Set(ids)),
      new ProductVariantService(this.db).stockLevels(variantIds),
      new MembershipService(this.db).termsForVariants(variantIds),
      (async () => {
        const singles = await ownership.singleVariants(variantIds)
        return [singles, await ownership.ownedVariants(content.userId, variantIds, singles)] as const
      })(),
    ])
    const stockLeft = (variantId: number) => stock.get(variantId)?.stock ?? null
    const inCart = new Map<number, number>()
    for (const line of content.lines) {
      inCart.set(line.variantId, (inCart.get(line.variantId) ?? 0) + line.quantity)
    }
    return {
      ...content,
      lines: content.lines.map((line, index) => ({
        ...line,
        tax: pricing.lines[index].tax,
        taxRate: pricing.lines[index].taxRate,
        // Whether the line is shipped to the buyer (its product class says so)
        requiresShipping: pricing.lines[index].requiresShipping,
        // Checkout fails while this is false; the buyer needs to remove the line.
        // Same rule as checkout: an active variant of a listed product, and for
        // a membership, a plan that is still active.
        isAvailable:
          line.variant.isActive &&
          listedIds.has(line.variant.productId) &&
          (terms.get(line.variantId)?.plan.isActive ?? true),
        // What is left of the variant (null when its stock is not counted), and
        // whether that covers all of it in the cart. Checkout fails while
        // isInStock is false; the buyer needs to lower the quantity.
        stockLeft: stockLeft(line.variantId),
        isInStock: stockLeft(line.variantId) === null || inCart.get(line.variantId)! <= stockLeft(line.variantId)!,
        // Checkout fails while this is set; the buyer needs to update the line
        customizationsError: customizationsError(
          line.variant.product.customFields,
          line.customizations,
        ),
        // Bought one at a time (a membership, or a once per person product):
        // its quantity stays 1
        oncePerPerson: singles.has(line.variantId),
        // The paid order the signed-in buyer owns it from, or null. Checkout
        // fails while this is set; the buyer needs to remove the line.
        ownedInOrder: owned.get(line.variantId) ?? null,
      })),
      // False when nothing in the cart is shipped (digital goods only): checkout
      // then takes no address and no shipping method
      requiresShipping: pricing.requiresShipping,
      // True when the cart has a membership or a once per person product: only
      // a signed-in buyer can order it
      requiresAccount: singles.size > 0,
      subtotal: pricing.subtotal,
      loyaltyDiscount: pricing.loyaltyDiscount,
      shippingCharge: pricing.shippingCharge,
      tax: pricing.tax,
      total: pricing.total,
      pricesIncludeTax: pricing.pricesIncludeTax,
    }
  }

  // Whether anything in the cart is shipped to the buyer: a line whose product
  // has no class, or a class that requires shipping. Same rule as the summary.
  async requiresShipping(cartId: number): Promise<boolean> {
    const [line] = await this.db
      .select({ id: cartLines.id })
      .from(cartLines)
      .innerJoin(productVariants, eq(productVariants.id, cartLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productClasses, eq(productClasses.id, products.productClassId))
      .where(
        and(
          eq(cartLines.cartId, cartId),
          or(isNull(productClasses.id), eq(productClasses.requiresShipping, true)),
        ),
      )
      .limit(1)
    return line !== undefined
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
      },
      where: eq(carts.sessionId, sessionId),
    })
    if(!content) {
      throw new NotFoundError(`Cart not found for session: ${sessionId}`)
    }
    let cartContent: CartContent = {
      ...content,
      lines: content.lines.map((line) => ({
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
      notCombinedVoucherOffers: [],
    }
    if (withOffersInfo) {
      cartContent = await this.withOffers(cartContent)
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
      // Only open carts: a checked-out or merged cart must not change
      const userCart = await tx.query.carts.findFirst({
        with: {
          lines: {
            with: lineVariant,
          },
        },
        where: and(eq(carts.userId, userId), eq(carts.status, 'Open')),
        orderBy: [desc(carts.updatedAt), desc(carts.id)],
      })
      // A guest cart, or one already this user's; never another user's
      const sessionCart = await tx.query.carts.findFirst({
        with: {
          lines: {
            with: lineVariant,
          },
        },
        where: and(
          eq(carts.sessionId, sessionId),
          eq(carts.status, 'Open'),
          or(isNull(carts.userId), eq(carts.userId, userId)),
        ),
      })
      if (sessionCart && userCart?.id === sessionCart.id) {
        return { ...sessionCart, lines: sessionCart.lines.map(withLineVariant) }
      }
      if (!userCart) {
        if (!sessionCart) {
          return {
            ...(await cartService.create(userId)),
            lines: [],
          }
        }
        await tx.update(carts).set({ userId }).where(eq(carts.id, sessionCart.id))
        return await cartService.getCartContentForSession(sessionCart.sessionId) as CartContentWithoutOfferInfo
      }
      if (!sessionCart) {
        return { ...userCart, lines: userCart.lines.map(withLineVariant) }
      }

      // A membership program the guest cart has a plan of keeps that one
      const terms = await new MembershipService(tx).termsForVariants(
        [...userCart.lines, ...sessionCart.lines].map((line) => line.variantId),
      )
      const program = (line: CartLine) => terms.get(line.variantId)?.plan.program
      const sessionPrograms = new Set(sessionCart.lines.map(program).filter(Boolean))
      // and a variant bought one at a time keeps the guest cart's line
      const singles = await new OwnershipService(tx).singleVariants(
        [...userCart.lines, ...sessionCart.lines].map((line) => line.variantId),
      )
      const sessionVariants = new Set(sessionCart.lines.map((line) => line.variantId))
      const userLines = userCart.lines.filter(
        (line) => !sessionPrograms.has(program(line)) && !(singles.has(line.variantId) && sessionVariants.has(line.variantId)),
      )

      const lines: NewCartLine[] = []
      for (const userLine of userLines) {
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
        if (!userLines.find((l: CartLine) => sameLine(l, sessionLine))) {
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
        .where(eq(carts.id, sessionCart.id))

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

  // The site offers (every cart, guests included), then the user's offers
  // (theirs, everyone's, and their plans'), that apply now
  private async automaticOffers(userId: string | null) {
    const offerService = new OfferService(this.db)
    const [site, user] = await Promise.all([
      offerService.getActiveUserOffers(userId, { type: 'site' }),
      userId ? offerService.getActiveUserOffers(userId) : [],
    ])
    return [
      ...site.map((offer) => ({ offer, kind: 'site' as const })),
      ...user.map((offer) => ({ offer, kind: 'user' as const })),
    ].filter(({ offer }) => offer.benefit?.isActive)
  }

  // Applies the site offers that combine with others
  async applySiteOffers(cartContent: CartContent) {
    const offerService = new OfferService(this.db)
    for (const { offer, kind } of await this.automaticOffers(cartContent.userId)) {
      if (kind === 'site' && offer.combinesWithOtherOffers) {
        cartContent = await offerService.applyUserOffer(offer, cartContent, kind)
      }
    }
    return cartContent
  }

  // Applies the user's offers that combine with others
  async applyUserOffers(cartContent: CartContent, userId: string) {
    const offerService = new OfferService(this.db)
    for (const { offer, kind } of await this.automaticOffers(userId)) {
      if (kind === 'user' && offer.combinesWithOtherOffers) {
        cartContent = await offerService.applyUserOffer(offer, cartContent, kind)
      }
    }
    return cartContent
  }

  // The cart with its offers and vouchers. The ones that combine are applied
  // together (site offers, then user offers, then vouchers); each one that
  // does not is priced alone. The cart gets whichever gives the biggest
  // discount (on a tie, the ones that combine). Applied vouchers left out are
  // listed in notCombinedVoucherOffers: they stay on the cart, give nothing
  // and are not used up.
  private async withOffers(base: CartContent): Promise<CartContent> {
    const offerService = new OfferService(this.db)
    const [automatic, [voucherRow]] = await Promise.all([
      this.automaticOffers(base.userId),
      this.db
        .select({ cartId: cartAppliedVoucherOffers.cartId })
        .from(cartAppliedVoucherOffers)
        .where(eq(cartAppliedVoucherOffers.cartId, base.id))
        .limit(1),
    ])
    // Which products each offer covers depends only on the offer, so these
    // are read at once. The offers are then applied in order.
    const productIds = base.lines.map((line) => line.variant.productId)
    const byRange = await offerService.productsInOfferRanges(
      automatic.map(({ offer }) => offer.condition!.rangeId),
      productIds,
    )
    const ranges = automatic.map(({ offer }) => byRange.get(offer.condition!.rangeId) ?? [])
    let combined = withoutOffers(base)
    const alone: CartContent[] = []
    automatic.forEach(({ offer, kind }, index) => {
      if (offer.combinesWithOtherOffers) {
        combined = offerService.applyUserOfferInRange(offer, combined, kind, ranges[index])
      } else {
        alone.push(offerService.applyUserOfferInRange(offer, withoutOffers(base), kind, ranges[index]))
      }
    })
    const appliedVouchers: { id: number; name: string; voucherCode: string }[] = []
    // Most carts have no vouchers: then there is nothing to re-apply, and no
    // need to lock the cart
    if (voucherRow) combined = await this.db.transaction(async (tx) => {
      let content = combined
      // Locked, and the vouchers read after it, so reads of the same cart
      // re-apply its vouchers one at a time. Otherwise a read could clear
      // them while another re-applies them, and answer without them.
      await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, content.id)).for('update')
      const appliedVoucherOffers = await tx.query.cartAppliedVoucherOffers.findMany({
        with: { offer: { with: { benefit: true, condition: true } } },
        where: eq(cartAppliedVoucherOffers.cartId, content.id),
      })
      await new CartService(tx).resetAppliedVoucherOffers(content.id)
      for (const appliedOffer of appliedVoucherOffers) {
        const { offer } = appliedOffer
        try {
          // A savepoint per voucher, so a database error while applying one
          // does not abort the transaction and drop the others
          const applied = await tx.transaction((savepoint) =>
            new OfferService(savepoint).applyVoucherCode(content, offer, undefined, content.userId || undefined),
          )
          // One that does not combine comes back priced alone
          if (offer.combinesWithOtherOffers) content = applied
          else alone.push(applied)
          appliedVouchers.push({ id: offer.id, name: offer.name, voucherCode: offer.voucherCode! })
        } catch (e) {
          console.error(e)
        }
      }
      return content
    })
    const best = alone.reduce(
      (best, candidate) => (candidate.totalOfferDiscount > best.totalOfferDiscount ? candidate : best),
      combined,
    )
    const used = new Set(best.voucherOfferDiscounts.map((discount) => discount.id))
    best.notCombinedVoucherOffers = appliedVouchers.filter((voucher) => !used.has(voucher.id))
    return best
  }
}

export { CartService, customizationsError }
