// Order statuses as staff see them, and the step that usually comes next

export const orderStatuses = [
  'Pending',
  'Confirmed',
  'Processing',
  'Processed',
  'Couriered',
  'Shipped',
  'Delivered',
  'Returned',
  'Completed',
] as const
export type OrderStatus = (typeof orderStatuses)[number] | 'Cancelled'

type Color = 'warning' | 'info' | 'primary' | 'success' | 'neutral' | 'error'
export const statusColor: Record<OrderStatus, Color> = {
  Pending: 'warning',
  Confirmed: 'info',
  Processing: 'primary',
  Processed: 'primary',
  Couriered: 'info',
  Shipped: 'info',
  Delivered: 'success',
  Returned: 'warning',
  Completed: 'neutral',
  Cancelled: 'error',
}

// The usual path: Pending, Confirmed, Processing, Shipped, Delivered,
// Completed. Processed and Couriered (set from the menu) lead on to Shipped.
export const nextStep: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  Pending: { status: 'Confirmed', label: 'Confirm order' },
  Confirmed: { status: 'Processing', label: 'Start processing' },
  Processing: { status: 'Shipped', label: 'Mark shipped' },
  Processed: { status: 'Shipped', label: 'Mark shipped' },
  Couriered: { status: 'Shipped', label: 'Mark shipped' },
  Shipped: { status: 'Delivered', label: 'Mark delivered' },
  Delivered: { status: 'Completed', label: 'Complete' },
}
// For an order with nothing to ship (digital goods): confirm, then complete
export const unshippedNextStep: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  Pending: { status: 'Confirmed', label: 'Confirm order' },
  Confirmed: { status: 'Completed', label: 'Complete' },
}

export const paymentColor: Record<string, Color> = { Pending: 'warning', Paid: 'success', Refunded: 'neutral' }
