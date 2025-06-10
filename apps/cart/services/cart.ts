import { and, desc, eq, inArray, sql } from 'drizzle-orm'
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
import { CartContent, CartContentWithoutOfferInfo, Database } from '../../types'

const SUM_PRODUCT_QUANTITY_ON_CART_MERGE = true

class CartService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
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

    if (!discountedPrice && !price) {
      throw new Error('Product price not found')
    }

    const result = await this.db
      .insert(cartLines)
      .values({
        cartId,
        productId,
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
    withOffersInfo = false,
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
    if(!content) {
      throw new Error(`Cart not found for session: ${sessionId}`)
    }
    const {appliedVoucherOffers, ...rest} = content
    let cartContent: CartContent = {
      ...rest,
      lines: rest.lines.map((line) => ({
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
  ): Promise<CartContentWithoutOfferInfo> {
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
        lines: {
          with: {
            product: {
              columns: {
                price: true,
                stockQuantity: true,
                inventoryCost: true,
                discountedPrice: true,
              },
            },
          },
        },
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
      return await this.getCartContentForSession(result[0].sessionId) as CartContentWithoutOfferInfo
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
        lines: {
          with: {
            product: {
              columns: {
                price: true,
                discountedPrice: true,
                stockQuantity: true,
                inventoryCost: true,
              },
            },
          },
        },
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
            })
          } else {
            lines.push({
              id: undefined,
              cartId: sessionCart.id,
              productId: userLine.productId,
              quantity: userLine.quantity,
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
          sessionLine.createdAt = sessionLine.createdAt
        }
        if (
          sessionLine.updatedAt &&
          typeof sessionLine.updatedAt === 'string'
        ) {
          sessionLine.updatedAt = sessionLine.updatedAt
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

    const insertedLinesWithProduct = await this.db.query.cartLines.findMany({
      where: inArray(cartLines.id, insertedLines.map(l => l.id)),
      with: {
        product: {
          columns: {
            price: true,
            stockQuantity: true,
            inventoryCost: true,
            discountedPrice: true,
          },
        },
      },
    })

    return {
      ...sessionCart,
      lines: insertedLinesWithProduct
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
