import type { H3Event } from 'h3'
import { z } from 'zod'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'

const CART_COOKIE = 'awe_cart'

const setCartCookie = (event: H3Event, sessionId: string) => {
  setCookie(event, CART_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

const cookieSessionId = (event: H3Event) => {
  const sessionId = z.uuid().safeParse(getCookie(event, CART_COOKIE))
  return sessionId.success ? sessionId.data : undefined
}

// The buyer's open cart.
// - Guests: the cookie's cart, unless a user owns it (after signing out, the
//   cookie no longer shows the account's cart).
// - Signed in: their own cart. A guest cart still in the cookie is merged into
//   it the first time they are seen signed in, so what they added before
//   signing in is kept.
// A checked-out cart counts as no cart.
export const findCart = async (event: H3Event) => {
  const cartService = new CartService(useDb())
  const sessionId = cookieSessionId(event)
  const cookieCart = sessionId ? await cartService.getCartForSession(sessionId) : undefined
  const user = await getUser(event)
  if (!user) {
    return cookieCart && !cookieCart.userId ? cookieCart : undefined
  }
  if (cookieCart && !cookieCart.userId) {
    const merged = await cartService.mergeCarts(user.id, cookieCart.sessionId)
    setCartCookie(event, merged.sessionId)
    return await cartService.getCartForSession(merged.sessionId)
  }
  const cart = await cartService.getCartForUser(user.id)
  if (cart && cart.sessionId !== sessionId) {
    setCartCookie(event, cart.sessionId)
  }
  return cart
}

// The buyer's open cart, created on first use, with the cookie set
export const findOrCreateCart = async (event: H3Event) => {
  const cart = await findCart(event)
  if (cart) {
    return cart
  }
  const user = await getUser(event)
  const created = await new CartService(useDb()).create(user?.id)
  setCartCookie(event, created.sessionId)
  return created
}

// After checkout the cart is closed; the next add starts a new one
export const forgetCart = (event: H3Event) => {
  deleteCookie(event, CART_COOKIE, { path: '/' })
}

// The buyer's open cart, or a 404 when there is none
export const requireCart = async (event: H3Event) => {
  const cart = await findCart(event)
  if (!cart) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Cart not found' })
  }
  return cart
}

export const cartSummary = async (
  cart: { sessionId: string },
  options: { shippingMethodId?: number; redeemPoints?: number } = {},
) => {
  const summary = await new CartService(useDb()).getCartSummary(cart.sessionId, options)
  return {
    ...summary,
    lines: summary.lines.map((line) => ({ ...line, variant: storeVariant(line.variant) })),
  }
}

export const cartLineParams = z.object({ id: z.coerce.number().int() })

export const cartQuery = z.object({
  // Includes this method's charge and its tax in the totals
  shippingMethodId: z.coerce.number().int().optional(),
  // Previews the value of redeeming this many loyalty points (signed in only)
  redeemPoints: z.coerce.number().positive().optional(),
})
