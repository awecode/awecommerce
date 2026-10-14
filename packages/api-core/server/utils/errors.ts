import type { EventHandlerRequest, H3Event } from 'h3'
import {
  CustomizationsNoLongerValidError,
  OfferLimitReachedError,
  OrderTotalMismatchError,
  VoucherNoLongerValidError,
} from '@awecommerce/service/apps/order/services/order'
import { OutOfStockError } from '@awecommerce/service/apps/product/services/product'
import { NotFoundError, ValidationError } from '@awecommerce/service/core/errors'

// Errors the buyer can fix (refresh the cart, change answers, drop a voucher,
// lower a quantity)
const conflictErrors = [
  CustomizationsNoLongerValidError,
  OfferLimitReachedError,
  OrderTotalMismatchError,
  OutOfStockError,
  VoucherNoLongerValidError,
]

// The Postgres error behind a failed query, if any. Drizzle wraps it as `cause`.
const postgresError = (error: unknown) => {
  for (let e: any = error; e; e = e.cause) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return e as { code: string; detail?: string; constraint?: string }
    }
  }
}

// Turns a service error into an HTTP error. The error's fields (offerId,
// cartLineId, expectedTotal, available, ...) and its name, as `code`, go in `data`.
export const toHttpError = (error: unknown) => {
  if (isError(error)) {
    return error
  }
  if (conflictErrors.some((ErrorClass) => error instanceof ErrorClass)) {
    const { name, message, ...fields } = error as Error
    return createError({ statusCode: 409, statusMessage: 'Conflict', message, data: { code: name, ...fields } })
  }
  if (error instanceof NotFoundError) {
    return createError({ statusCode: 404, statusMessage: 'Not Found', message: error.message })
  }
  if (error instanceof ValidationError) {
    return createError({ statusCode: 422, statusMessage: 'Unprocessable Entity', message: error.message })
  }
  // Database rules, with Postgres's own detail, such as
  // `Key (slug)=(mug) already exists.`
  const pg = postgresError(error)
  if (pg?.code === '23505') {
    return createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: pg.detail ?? 'Already exists',
      data: { code: 'AlreadyExists', constraint: pg.constraint },
    })
  }
  if (pg?.code === '23503') {
    // Deleting a record others still point at, or pointing at a missing one
    const inUse = pg.detail?.includes('is still referenced') ?? false
    return createError({
      statusCode: inUse ? 409 : 422,
      statusMessage: inUse ? 'Conflict' : 'Unprocessable Entity',
      message: pg.detail ?? 'Referenced record problem',
      data: { code: inUse ? 'InUse' : 'MissingReference', constraint: pg.constraint },
    })
  }
  return error
}

// defineEventHandler that maps service errors with toHttpError
export const defineServiceHandler = <T>(
  handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>,
) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      throw toHttpError(error)
    }
  })
