import type { H3Event } from 'h3'
import { inArray } from 'drizzle-orm'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { productClasses, products } from '@awecommerce/service/apps/product/schemas'

// Fulfilment hooks: code that runs when an order with certain products is
// placed, paid, refunded or cancelled (send a download link, issue a licence key, book
// a seat), and a short note per line for the buyer, shown on the storefront
// order page and in the order placed email.
//
// Register them from a Nitro plugin, in a layer both apps extend, since the
// storefront places orders and shows the notes while the backoffice marks
// them paid or cancels them:
//
//   export default defineNitroPlugin(() => {
//     registerFulfillment({
//       name: 'e-books',
//       productClasses: ['e-book'],
//       on: { paid: async ({ order, lines }) => { ... } },
//       note: ({ order }) => order.paymentStatus === 'Paid'
//         ? { title: 'Ready to download', text: 'Your e-book is ready.', link: { label: 'Download', url: '...' } }
//         : { title: 'Download after payment', text: 'We will send the link once you have paid.' },
//     })
//   })
//
// A hook matches a line by its product's class slug or its product slug, or
// by its own `match`.

export type FulfillmentEvent = 'placed' | 'paid' | 'refunded' | 'cancelled'

export type FulfillmentNote = { title: string; text: string; link?: { label: string; url: string } }

type Order = NonNullable<Awaited<ReturnType<OrderService['get']>>>
type OrderLine = Order['lines'][number]

export type Fulfillment = {
  // Names the hook in logs
  name: string
  productClasses?: string[]
  products?: string[]
  // Any other test for a line, such as the variant selling a membership
  match?: (line: OrderLine) => boolean | Promise<boolean>
  // Runs once per event with the order's matching lines. A hook that throws
  // is logged; the order and the other hooks are not affected.
  on?: Partial<Record<FulfillmentEvent, (context: { event: H3Event; order: Order; lines: OrderLine[] }) => void | Promise<void>>>
  // Read whenever the note is shown, so it can follow the order (paid or not)
  note?: (context: { order: Order; line: OrderLine }) => FulfillmentNote | null | undefined | Promise<FulfillmentNote | null | undefined>
}

const fulfillments: Fulfillment[] = []

export const registerFulfillment = (fulfillment: Fulfillment): void => {
  fulfillments.push(fulfillment)
}

// Each registered hook with the order lines it matches
const matching = async (order: Order): Promise<{ fulfillment: Fulfillment; lines: OrderLine[] }[]> => {
  if (!fulfillments.length) return []
  const productIds = [...new Set(order.lines.map((line) => line.productId))]
  const rows = await useDb()
    .select({ id: products.id, slug: products.slug, classId: products.productClassId })
    .from(products)
    .where(inArray(products.id, productIds))
  const classIds = [...new Set(rows.map((row) => row.classId).filter((id) => id !== null))]
  const classSlugs = new Map(
    classIds.length
      ? (await useDb().select({ id: productClasses.id, slug: productClasses.slug }).from(productClasses).where(inArray(productClasses.id, classIds))).map(
          (row) => [row.id, row.slug],
        )
      : [],
  )
  const slugs = new Map(rows.map((row) => [row.id, { product: row.slug, productClass: row.classId === null ? undefined : classSlugs.get(row.classId) }]))
  const matches: { fulfillment: Fulfillment; lines: OrderLine[] }[] = []
  for (const fulfillment of fulfillments) {
    const lines: OrderLine[] = []
    for (const line of order.lines) {
      const slug = slugs.get(line.productId)
      if (
        (slug !== undefined && fulfillment.products?.includes(slug.product)) ||
        (slug?.productClass !== undefined && fulfillment.productClasses?.includes(slug.productClass)) ||
        (fulfillment.match && (await fulfillment.match(line)))
      ) {
        lines.push(line)
      }
    }
    if (lines.length) matches.push({ fulfillment, lines })
  }
  return matches
}

// Runs the hooks for this event on the order. Never throws: failures are
// logged, and the order, payment or cancellation stays as it is.
export const runFulfillment = async (event: H3Event, kind: FulfillmentEvent, orderId: number): Promise<void> => {
  try {
    const order = await new OrderService(useDb()).get(orderId)
    if (!order) return
    for (const { fulfillment, lines } of await matching(order)) {
      const hook = fulfillment.on?.[kind]
      if (!hook) continue
      try {
        await hook({ event, order, lines })
      } catch (error) {
        console.error(`Order ${orderId}: the ${fulfillment.name} ${kind} hook failed`, error)
      }
    }
  } catch (error) {
    console.error(`Order ${orderId}: the ${kind} hooks could not run`, error)
  }
}

// What a line not shipped says when no hook has a note for it
const confirmed: FulfillmentNote = {
  title: 'Your purchase is confirmed',
  text: 'There is nothing to ship. We will be in touch about what comes next.',
}

// The note for each line that has one, by order line id: the first matching
// hook's note, else the generic one for a line that is not shipped (not once
// the order is cancelled). A failing note is logged and left out.
export const fulfillmentNotes = async (orderId: number): Promise<Map<number, FulfillmentNote>> => {
  const notes = new Map<number, FulfillmentNote>()
  try {
    const order = await new OrderService(useDb()).get(orderId)
    if (!order) return notes
    for (const { fulfillment, lines } of await matching(order)) {
      if (!fulfillment.note) continue
      for (const line of lines) {
        if (notes.has(line.id)) continue
        try {
          const note = await fulfillment.note({ order, line })
          if (note) notes.set(line.id, note)
        } catch (error) {
          console.error(`Order ${orderId}: the ${fulfillment.name} note failed`, error)
        }
      }
    }
    if (order.status !== 'Cancelled') {
      for (const line of order.lines) {
        if (!line.requiresShipping && !notes.has(line.id)) notes.set(line.id, confirmed)
      }
    }
  } catch (error) {
    console.error(`Order ${orderId}: the fulfilment notes could not be read`, error)
  }
  return notes
}
