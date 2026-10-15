import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { users } from '../../../auth/server/db/schema'
import { type OrderEmailKind, type OrderEmailOrder, orderEmailContent } from '../order-emails'

type MailableOrder = OrderEmailOrder & { userId: string | null; guestUser: Record<string, any> | null }

// Emails the customer that their order was placed, shipped or cancelled, with
// a link to the order on the storefront that works without signing in (the
// checkout hash). It goes to the guest's email, or to the member's account
// email; with neither, nothing is sent. The placed email has each line's
// fulfilment note.
//
// Never throws: a missing address or storefront URL, or a failed send, is
// logged, and the order, status change or cancellation stays as it is.
// `requestOrigin`: when NUXT_PUBLIC_SITE_URL is not set, link to the
// request's own address. Only for requests the storefront serves.
export const sendOrderEmail = async (
  event: H3Event,
  kind: OrderEmailKind,
  order: MailableOrder,
  { requestOrigin = false } = {},
): Promise<void> => {
  try {
    const to = await orderEmailAddress(order)
    if (!to) {
      console.warn(`Order ${order.id}: no email address, the ${kind} email was not sent`)
      return
    }
    const configured = useRuntimeConfig(event).public.siteUrl as string
    const origin = (configured || (requestOrigin ? getRequestURL(event).origin : '')).replace(/\/$/, '')
    if (!origin) {
      console.error(`Order ${order.id}: NUXT_PUBLIC_SITE_URL is not set, the ${kind} email was not sent`)
      return
    }
    const db = useDb()
    const hash = new OrderService(db).generateHash(String(order.id))
    const link = `${origin}/orders/${order.id}?hash=${encodeURIComponent(hash)}`
    const store = await new StoreSettingsService(db).getSettings()
    const notes = kind === 'placed' ? await fulfillmentNotes(order.id) : new Map<number, FulfillmentNote>()
    const lines = order.lines.map((line) => ({ ...line, note: notes.get(line.id) }))
    const { subject, html, text } = orderEmailContent(kind, { ...order, lines }, store, link)
    await sendEmail({ toEmails: [to], subject, html, message: text })
  } catch (error) {
    console.error(`Order ${order.id}: the ${kind} email could not be sent`, error)
  }
}

// The guest's email, or the member's account email
const orderEmailAddress = async (order: MailableOrder): Promise<string | null> => {
  const guestEmail = order.guestUser?.email
  if (typeof guestEmail === 'string' && guestEmail.trim()) return guestEmail.trim()
  if (!order.userId) return null
  const [user] = await useDb().select({ email: users.email }).from(users).where(eq(users.id, order.userId))
  return user?.email || null
}
