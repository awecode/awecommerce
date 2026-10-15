import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Each hook writes its runs to the order's log, for the tests to read
export default defineNitroPlugin(() => {
  const record = (kind: string) => async ({ order, lines }: { order: { id: number }; lines: { sku: string }[] }) => {
    await new OrderService(useDb()).createLog(order.id, `e-books ${kind}: ${lines.map((line) => line.sku).join(', ')}`)
  }
  registerFulfillment({
    name: 'e-books',
    productClasses: ['test-e-book'],
    on: { placed: record('placed'), paid: record('paid'), cancelled: record('cancelled') },
    note: ({ order }) =>
      order.paymentStatus === 'Paid'
        ? { title: 'Ready to download', text: 'Your e-book is ready.', link: { label: 'Download', url: 'https://files.test/e-book' } }
        : { title: 'Download after payment', text: 'The link appears here once you have paid.' },
  })
  registerFulfillment({
    name: 'broken',
    productClasses: ['test-broken'],
    on: {
      placed: () => {
        throw new Error('The broken hook failed')
      },
    },
    note: () => {
      throw new Error('The broken note failed')
    },
  })
})
