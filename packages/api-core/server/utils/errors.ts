import type { EventHandlerRequest, H3Event } from 'h3'
import {
  CustomizationsNoLongerValidError,
  OfferLimitReachedError,
  OrderTotalMismatchError,
  VoucherNoLongerValidError,
} from '@awecommerce/service/apps/order/services/order'
import { NotFoundError, ValidationError } from '@awecommerce/service/core/errors'

// Errors the buyer can fix (refresh the cart, change answers, drop a voucher)
const conflictErrors = [
  CustomizationsNoLongerValidError,
  OfferLimitReachedError,
  OrderTotalMismatchError,
  VoucherNoLongerValidError,
]

// Turns a service error into an HTTP error. The error's fields (offerId,
// cartLineId, expectedTotal, ...) and its name, as `code`, go in `data`.
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
