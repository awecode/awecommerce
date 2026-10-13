import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  optionValuesWithOption,
  withVariantOptions,
} from '../../product/services/product'
import { productVariants } from '../../product/schemas'
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

  async addToCart(cartId: number, variantId: number, quantity: number) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1')
    }
    const [variant] = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
    if (!variant) {
      throw new Error(`Product variant not found: ${variantId}`)
    }
    if (!variant.isActive) {
      throw new Error(`Product variant is not available: ${variantId}`)
    }
    if (!variant.discountedPrice && !variant.price) {
      throw new Error('Product price not found')
    }

    const result = await this.db
      .insert(cartLines)
      .values({
        cartId,
        variantId,
        quantity,
      })
      .returning()

    return result[0]
  }

  async updateQuantity(cartId: number, cartLineId: number, quantity: number) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1')
    }
    const result = await this.db
      .update(cartLines)
      .set({ quantity })
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
      .returning()
    return result[0]
  }

  async removeFromCart(cartId: number, cartLineId: number) {
    const result = await this.db
      .delete(cartLines)
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
      .returning()
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
      throw new Error(`Cart not found for session: ${sessionId}`)
    }
    const {appliedVoucherOffers, ...rest} = content
    let cartContent: CartContent = {
      ...rest,
      lines: rest.lines.map((line) => ({
        ...withLineVariant(line),
        userOfferDiscounts: [],
        voucherOfferDiscounts: [],
        totalOfferDiscount: 0,
      })),
      userOfferDiscounts: [],
      voucherOfferDiscounts: [],
      totalOfferDiscount: 0,
    }
    if (withOffersInfo) {
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
        const sessionLine = sessionCart.lines.find(
          (l: CartLine) => l.variantId === userLine.variantId,
        )
        if (sessionLine) {
          lines.push({
            cartId: sessionCart.id,
            variantId: sessionLine.variantId,
            id: sessionLine.id,
            quantity: sumProductQuantityOnCartMerge
              ? userLine.quantity + sessionLine.quantity
              : sessionLine.quantity,
          })
        } else {
          lines.push({
            cartId: sessionCart.id,
            variantId: userLine.variantId,
            quantity: userLine.quantity,
          })
        }
      }

      for (const sessionLine of sessionCart.lines) {
        if (!userCart.lines.find((l: CartLine) => l.variantId === sessionLine.variantId)) {
          lines.push({
            id: sessionLine.id,
            cartId: sessionLine.cartId,
            variantId: sessionLine.variantId,
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

  async applyUserOffers(cartContent: CartContent, userId: string) {
    const offerService = new OfferService(this.db)
    let offers = await offerService.getActiveUserOffers(userId)
    offers = offers.filter((offer) => offer.benefit?.isActive)
    offers = offers.filter(
      (offer) => offer.condition?.type === 'basket_quantity',
    )
    // TODO: Implement other offer types
    for (const offer of offers) {
      cartContent = await offerService.applyUserOffer(offer, cartContent)
    }
    return cartContent
  }
}

export { CartService }
