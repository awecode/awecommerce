import { and, desc, eq, sql } from 'drizzle-orm'
import { ProductService } from '../../product/services/product'
import { Cart, CartLine, cartLines, carts } from '../schemas'

const SUM_PRODUCT_QUANTITY_ON_CART_MERGE = true

interface CartContent {
  cart: Cart
  lines: CartLine[]
}

class CartService {
  private db: any 

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  async create(userId?: string) {
    const result = await this.db.insert(carts).values({ userId }).returning();
    return result[0];
  }

  async addToCart(sessionId: string, productId: number, quantity: number) {
    const productService = new ProductService(this.db);
    const { price, discountedPrice } = await productService.getPrices(productId);

    if (!price) {
      throw new Error('Product price not found');
    }

    const cartPrice = discountedPrice || price;

    const cartId = (
      await this.db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.sessionId, sessionId))
    )[0].id;

    const result = await this.db
      .insert(cartLines)
      .values({
        cartId,
        productId,
        quantity,
        price: cartPrice,
        originalPrice: price,
      })
      .returning();

    return result[0];
  }

  async updateQuantity(cartId: number, cartLineId: number, quantity: number) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }
    const result = await this.db
      .update(cartLines)
      .set({ quantity })
      .where(and(eq(cartLines.id, cartLineId), eq(cartLines.cartId, cartId)))
      .returning();
    return result[0];
  }

  async removeFromCart(cartId: number, cartLineId: number) {
    const result = await this.db
      .delete(cartLines)
      .where(and(
        eq(cartLines.id, cartLineId),
        eq(cartLines.cartId, cartId)
      ))
      .returning();
    return result[0];
  }

  async clearCart(cartId: number) {
    const result = await this.db
      .delete(cartLines)
      .where(eq(cartLines.cartId, cartId))
      .returning();
    return result[0];
  }

  async getCartForSession(sessionId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt));
    return result[0];
  }

  async getCartForUser(userId: string) {
    const result = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .orderBy(desc(carts.updatedAt));
    return result[0];
  }

  async getCartContentForSession(sessionId: string): Promise<CartContent> {
    const result = await this.db
      .select({
      cart: carts,
      lines: sql<CartLine[]>`COALESCE(jsonb_agg(${cartLines}.*) FILTER (WHERE ${cartLines}.id IS NOT NULL), '[]'::jsonb)`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(eq(carts.sessionId, sessionId))
      .groupBy(carts.id);
    return result[0];
  }

  async mergeCarts(
    userId: string,
    sessionId: string,
    sumProductQuantityOnCartMerge: boolean = SUM_PRODUCT_QUANTITY_ON_CART_MERGE,
  ): Promise<CartContent> {
    const userCart = await this.db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(and(eq(carts.userId, userId), eq(carts.status, 'Open')))
      .groupBy(carts.id)
      .orderBy(desc(carts.updatedAt));
    if (!userCart.length) {
      const result = await this.db
        .update(carts)
        .set({ userId })
        .where(eq(carts.sessionId, sessionId))
        .returning();
      if (!result.length) {
        return {
          cart: await this.create(userId),
          lines: [],
        };
      }
      return await this.getCartContentForSession(result[0].sessionId);
    }
    const sessionCart = await this.db
      .select({
        cart: carts,
        lines: sql<CartLine[]>`json_agg(${cartLines})`,
      })
      .from(carts)
      .leftJoin(cartLines, eq(carts.id, cartLines.cartId))
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, 'Open')))
      .groupBy(carts.id)
      .orderBy(desc(carts.updatedAt));
    if (!sessionCart.length) {
      return userCart[0];
    }

    const lines = [];
    if (userCart[0].lines?.length && userCart[0].lines[0]) {
      for (const userLine of userCart[0].lines) {
        if (userLine.productId) {
          const sessionLine = sessionCart[0].lines.find(
            (l) => l?.productId === userLine.productId,
          );
          if (sessionLine) {
            lines.push({
              id: sessionLine.id,
              quantity: sumProductQuantityOnCartMerge
                ? userLine.quantity + sessionLine.quantity
                : sessionLine.quantity,
              price: sessionLine.price,
              originalPrice: sessionLine.originalPrice,
            });
          } else {
            lines.push({
              id: undefined,
              cartId: sessionCart[0].cart.id,
              productId: userLine.productId,
              quantity: userLine.quantity,
              price: userLine.price,
              originalPrice: userLine.originalPrice,
            });
          }
        }
      }
    }

    for (const sessionLine of sessionCart[0].lines) {
      if (
        sessionLine &&
        !userCart[0].lines.find((l) => l?.productId === sessionLine.productId)
      ) {
        if (
          sessionLine.createdAt &&
          typeof sessionLine.createdAt === 'string'
        ) {
          sessionLine.createdAt = new Date(sessionLine.createdAt);
        }
        if (
          sessionLine.updatedAt &&
          typeof sessionLine.updatedAt === 'string'
        ) {
          sessionLine.updatedAt = new Date(sessionLine.updatedAt);
        }
        lines.push(sessionLine);
      }
    }

    let insertedLines: CartLine[] = [];
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
        .returning();
    }

    await this.db
      .update(carts)
      .set({ status: 'Merged' })
      .where(eq(carts.id, userCart[0].cart.id));

    await this.db.update(carts).set({ userId }).where(eq(carts.sessionId, sessionId));

    sessionCart[0].cart.userId = userId;

    return {
      cart: sessionCart[0].cart,
      lines: insertedLines,
    };
  }
}

export { CartService }
