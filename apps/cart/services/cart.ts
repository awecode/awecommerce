import { productService } from 'apps/product/services/product'
import { db } from 'core/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Cart, CartLine, cartLines, carts } from '../schemas'

const SUM_PRODUCT_QUANTITY_ON_CART_MERGE = true

interface CartContent {
  cart: Cart
  lines: CartLine[]
}

export const cartService = {
  create: async (userId?: string) => {
    const result = await db.insert(carts).values({ userId }).returning()
    return result[0]
  },

  addToCart: async (sessionId: string, productId: number, quantity: number) => {
    const { price, discountedPrice } = await productService.getPrices(productId)

    if (!price) {
      throw new Error('Product price not found')
    }

    const cartPrice = discountedPrice || price

    const cartId = (
      await db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.sessionId, sessionId))
    )[0].id

    const result = await db
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
  },

  updateQuantity: async (cartLineId: number, quantity: number) => {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1')
    }
    const result = await db
      .update(cartLines)
      .set({ quantity })
      .where(eq(cartLines.id, cartLineId))
      .returning()
    return result[0]
  },

  removeFromCart: async (cartLineId: number) => {
    const result = await db
      .delete(cartLines)
      .where(eq(cartLines.id, cartLineId))
      .returning()
    return result[0]
  },

  clearCart: async (cartId: number) => {
    const result = await db
      .delete(cartLines)
      .where(eq(cartLines.cartId, cartId))
      .returning()
    return result[0]
  },

  getCartForSession: async (sessionId: string) => {
    const result = await db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt))
    return result[0]
  },

  getCartForUser: async (userId: string) => {
    const result = await db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt))
    return result[0]
  },

  getCartContentForSession: async (sessionId: string): Promise<CartContent> => {
    // returns cart with line items
    const result = await db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(eq(carts.sessionId, sessionId))
      .groupBy(carts.id)
    return result[0]
  },

  /**
   * Merges carts for a user and a session.
   *
   * 1. Gets the latest open cart for the user.
   * 2. Gets the latest open cart for the session.
   * 3. Merges the items from both carts.
   * 4. It's possible that neither cart exists.
   *
   * @param userId - The ID of the user whose cart needs to be merged.
   * @param sessionId - The session ID associated with the cart to be merged.
   */
  mergeCarts: async (
    userId: string,
    sessionId: string,
    sumProductQuantityOnCartMerge: boolean = SUM_PRODUCT_QUANTITY_ON_CART_MERGE,
  ): Promise<CartContent> => {
    // This should be a database function instead
    // Transaction
    // Get open cart for user
    const userCart = await db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .groupBy(carts.id)
      .orderBy(desc(carts.updatedAt))
    if (!userCart) {
      // set user id to session cart and return the cart content
      const result = await db
        .update(carts)
        .set({ userId })
        .where(eq(carts.sessionId, sessionId))
        .returning()
      if (!result) {
        // return newCart with empty lines
        return {
          cart: await cartService.create(userId),
          lines: [],
        }
      }
      return await cartService.getCartContentForSession(result[0].sessionId)
    }
    // Get open cart for session
    const sessionCart = await db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .groupBy(carts.id)
      .orderBy(desc(carts.updatedAt))
    if (!sessionCart) {
      return userCart[0]
    }
    // Get all cart lines from user cart and add to session cart, set user id to session cart.
    // For cart lines, if product exists in session cart, update quantity, otherwise add new line item.

    const lines = []
    for (const userLine of userCart[0].lines) {
      if (userLine.productId) {
        const sessionLine = sessionCart[0].lines.find(
          (l) => l.productId === userLine.productId,
        )
        if (sessionLine) {
          lines.push({
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
            cartId: sessionCart[0].cart.id,
            productId: userLine.productId,
            quantity: userLine.quantity,
            price: userLine.price,
            originalPrice: userLine.originalPrice,
          })
        }
      }
    }

    // Also add lines from session cart that are not in user cart
    for (const sessionLine of sessionCart[0].lines) {
      if (
        !userCart[0].lines.find((l) => l.productId === sessionLine.productId)
      ) {
        // TODO Fix for json_agg not returning createdAt and updatedAt as Date?
        // if (is(sessionLine.createdAt, PgTimestampString))
        //   sessionLine.createdAt = new Date(sessionLine.createdAt)
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

    // insert or update cart lines
    const insertedLines = await db
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

    // Mark user cart as merged
    await db
      .update(carts)
      .set({ status: 'Merged' })
      .where(eq(carts.id, userCart[0].cart.id))

    // set user id to session cart
    await db.update(carts).set({ userId }).where(eq(carts.sessionId, sessionId))

    sessionCart[0].cart.userId = userId

    return {
      cart: sessionCart[0].cart,
      lines: insertedLines,
    }
  },
}
