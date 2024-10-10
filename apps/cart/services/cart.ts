import { db } from 'core/db'
import { CartLine, cartLines, carts } from '../schemas'
import { eq, desc, and, sql } from 'drizzle-orm'
import { productService } from 'apps/product/services/product'

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

  getCartContentForSession: async (sessionId: string) => {
    // returns cart with line items
    const result = await db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(eq(carts.sessionId, sessionId))
      .groupBy(carts.id)
    return result[0]
  },
}
