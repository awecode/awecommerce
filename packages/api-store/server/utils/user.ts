import type { H3Event } from 'h3'

// The signed-in user, or a 401
export const requireUser = async (event: H3Event) => {
  await requireAuthenticated(event)
  return (await getUser(event))!
}
