import type { H3Event } from 'h3'

// The signed-in admin (the admin middleware already checked the role)
export const currentAdmin = async (event: H3Event) => (await getUser(event))!

// Runs a Better Auth endpoint and turns its errors (such as a missing user)
// into HTTP errors with the same status and message
export const callAuth = async <T>(call: () => Promise<T>) => {
  try {
    return await call()
  } catch (error: any) {
    if (typeof error?.statusCode === 'number' && error?.body) {
      throw createError({ statusCode: error.statusCode, message: error.body.message ?? error.message })
    }
    throw error
  }
}
