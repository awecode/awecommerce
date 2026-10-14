import type { H3Event } from 'h3'
import { z } from 'zod'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'

const CART_COOKIE = 'awe_cart'

// The buyer's open cart, from the cart cookie. A cart that was checked out, or
// a cookie that does not match a cart, counts as no cart.
export const findCart = async (event: H3Event) => {
  const sessionId = z.uuid().safeParse(getCookie(event, CART_COOKIE))
  if (!sessionId.success) {
    return undefined
  }
  return await new CartService(useDb()).getCartForSession(sessionId.data)
}

// The buyer's open cart, created on first use, with the cookie set
export const findOrCreateCart = async (event: H3Event) => {
  const cart = await findCart(event)
  if (cart) {
    return cart
  }
  const created = await new CartService(useDb()).create()
  setCookie(event, CART_COOKIE, created.sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return created
}

// The buyer's open cart, or a 404 when there is none
export const requireCart = async (event: H3Event) => {
  const cart = await findCart(event)
  if (!cart) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Cart not found' })
  }
  return cart
}

export const cartSummary = async (cart: { sessionId: string }) =>
  await new CartService(useDb()).getCartSummary(cart.sessionId)

export const cartLineParams = z.object({ id: z.coerce.number().int() })
