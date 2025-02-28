import { and, desc, eq, sql } from 'drizzle-orm'
import { ProductService } from '../../product/services/product'
import {
  Cart,
  cartAppliedVoucherOffers,
  CartLine,
  cartLines,
  carts,
} from '../schemas'
import { OfferService } from '../../offer/services/offer'
import { offers } from '../../offer/schemas'

const SUM_PRODUCT_QUANTITY_ON_CART_MERGE = true

type Extend<T, U> = T & U

type CartContent = Extend<
  Cart,
  {
    lines: Extend<
      CartLine,
      {
        userOfferDiscounts: {
          id: number
          discount: number
          name: string
        }[]
        voucherOfferDiscounts: {
          id: number
          discount: number
          name: string
        }[]
        totalOfferDiscount: number
      }
    >[]
    userOfferDiscounts: {
      id: number
      discount: number
      name: string
    }[]
    voucherOfferDiscounts: {
      id: number
      discount: number
      name: string
    }[]
    totalOfferDiscount: number
  }
>

class CartService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async create(userId?: string) {
    const result = await this.db.insert(carts).values({ userId }).returning()
    return result[0]
  }

  async addToCart(cartId: number, productId: number, quantity: number) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1')
    }
    const productService = new ProductService(this.db)
    const { price, discountedPrice } = await productService.getPrices(productId)

    if (!price) {
      throw new Error('Product price not found')
    }

    const cartPrice = discountedPrice || price

    const result = await this.db
      .insert(cartLines)
      .values({
        cartId,
        productId,
        quantity,
        price: cartPrice,
        originalPrice: price,
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
    await this.db
      .delete(cartLines)
      .where(eq(cartLines.cartId, cartId))
      .returning()
    await this.resetAppliedVoucherOffers(cartId)
  }

  async getCartForSession(sessionId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt))
    return result[0]
  }

  async getCartForUser(userId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt))
    return result[0]
  }

  async getCartContentForSession(
    sessionId: string,
    withOffersInfo = true,
  ): Promise<CartContent> {
    const content = await this.db.query.carts.findFirst({
      with: {
        lines: {
          with: {
            product: true,
          },
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
    const appliedVoucherOffers = content.appliedVoucherOffers || []
    let cartContent: CartContent = {
      ...content,
      appliedVoucherOffers: undefined,
      lines: content.lines.map((line) => ({
        ...line,
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
      await this.resetAppliedVoucherOffers(cartContent.id)
      if (appliedVoucherOffers.length) {
        const offerService = new OfferService(this.db)
        for (const appliedOffer of appliedVoucherOffers) {
          try {
            cartContent = await offerService.applyVoucherCode(
              cartContent,
              appliedOffer.offer,
              undefined,
              cartContent.userId || undefined,
            )
          } catch (e) {
            console.error(e)
          }
        }
      }
    }
    return cartContent
  }

  async mergeCarts(
    userId: string,
    sessionId: string,
    sumProductQuantityOnCartMerge: boolean = SUM_PRODUCT_QUANTITY_ON_CART_MERGE,
  ): Promise<CartContent> {
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
    const userCart = await this.db.query.carts.findFirst({
      with: {
        lines: true,
      },
      where: eq(carts.userId, userId),
      orderBy: desc(carts.updatedAt),
    })
    if (!userCart) {
      const result = await this.db
        .update(carts)
        .set({ userId })
        .where(eq(carts.sessionId, sessionId))
        .returning()
      if (!result.length) {
        return {
          ...(await this.create(userId)),
          lines: [],
        }
      }
      return await this.getCartContentForSession(result[0].sessionId)
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
    const sessionCart = await this.db.query.carts.findFirst({
      with: {
        lines: true,
      },
      where: eq(carts.sessionId, sessionId),
      orderBy: desc(carts.updatedAt),
    })
    if (!sessionCart) {
      return userCart
    }

    const lines = []
    if (userCart.lines?.length && userCart.lines[0]) {
      for (const userLine of userCart.lines) {
        if (userLine.productId) {
          const sessionLine = sessionCart.lines.find(
            (l: CartLine) => l?.productId === userLine.productId,
          )
          if (sessionLine) {
            lines.push({
              cartId: sessionCart.id,
              productId: sessionLine.productId,
              id: sessionLine.id,
              quantity: sumProductQuantityOnCartMerge
                ? userLine.quantity + sessionLine.quantity
                : sessionLine.quantity,
              price: sessionLine.price,
              originalPrice: sessionLine.originalPrice,
            })
          } else {
            lines.push({
              id: undefined,
              cartId: sessionCart.id,
              productId: userLine.productId,
              quantity: userLine.quantity,
              price: userLine.price,
              originalPrice: userLine.originalPrice,
            })
          }
        }
      }
    }

    for (const sessionLine of sessionCart.lines) {
      if (
        sessionLine &&
        !userCart.lines.find(
          (l: CartLine) => l?.productId === sessionLine.productId,
        )
      ) {
        if (
          sessionLine.createdAt &&
          typeof sessionLine.createdAt === 'string'
        ) {
          sessionLine.createdAt = new Date(sessionLine.createdAt)
        }
        if (
          sessionLine.updatedAt &&
          typeof sessionLine.updatedAt === 'string'
        ) {
          sessionLine.updatedAt = new Date(sessionLine.updatedAt)
        }
        lines.push(sessionLine)
      }
    }

    let insertedLines: CartLine[] = []
    if (lines.length) {
      insertedLines = await this.db
        .insert(cartLines)
        .values(lines)
        .onConflictDoUpdate({
          target: cartLines.id,
          set: {
            quantity: sql`excluded.quantity`,
            price: sql`excluded.price`,
          },
        })
        .returning()
    }

    await this.db
      .update(carts)
      .set({ status: 'Merged' })
      .where(eq(carts.id, userCart.id))

    await this.db
      .update(carts)
      .set({ userId })
      .where(eq(carts.sessionId, sessionId))

    sessionCart.userId = userId

    return {
      ...sessionCart,
      lines: insertedLines,
    }
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
    await this.db
      .delete(cartAppliedVoucherOffers)
      .leftJoin(carts, eq(cartAppliedVoucherOffers.cartId, carts.id))
      .leftJoin(offers, eq(cartAppliedVoucherOffers.offerId, offers.id))
      .where(
        and(
          eq(carts.sessionId, sessionId),
          eq(offers.voucherCode, voucherCode),
        ),
      )
  }

  async resetAppliedVoucherOffers(cartId: number) {
    await this.db
      .delete(cartAppliedVoucherOffers)
      .where(eq(cartAppliedVoucherOffers.cartId, cartId))
  }

  async applyUserOffers(cartContent: CartContent, userId: string) {
    const offerService = new OfferService(this.db)
    let offers = await offerService.getActiveUserOffers(userId)
    offers = offers.filter((offer) => offer.benefit.isActive)
    offers = offers.filter(
      (offer) => offer.condition.type === 'basket_quantity',
    )
    // TODO: Implement other offer types
    for (const offer of offers) {
      cartContent = await offerService.applyUserOffer(offer, cartContent)
    }
    return cartContent
  }
}

export { CartService }
