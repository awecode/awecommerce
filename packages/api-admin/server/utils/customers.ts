import { ilike, inArray, or } from 'drizzle-orm'
import { users } from '../../../auth/server/db/schema'

// Orders keep a user id (members) or the guest's details. These put a name and
// email on them, from the auth layer's users, which the library does not have.
// Their return types are written out: these helpers are auto-imported, and the
// inferred Drizzle types are too deep for the apps' typed $fetch routes.

type Person = { name: string; email: string }

// The users with these ids, by id
export const usersById = async (ids: (string | null | undefined)[]): Promise<Map<string, Person>> => {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!wanted.length) return new Map<string, Person>()
  const rows = await useDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, wanted))
  return new Map(rows.map(({ id, ...person }) => [id, person]))
}

// Ids of users whose email or name contains `q`, for searching orders
export const userIdsMatching = async (q: string): Promise<string[]> =>
  (
    await useDb()
      .select({ id: users.id })
      .from(users)
      .where(or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)))
      .limit(100)
  ).map((row) => row.id)

// The order's customer: the member's name and email, or the guest's
export const customerOf = (
  order: { userId: string | null; guestUser: Record<string, any> | null },
  people: Map<string, Person>,
): (Person & { guest: boolean }) | null => {
  const member = order.userId ? people.get(order.userId) : undefined
  if (member) return { ...member, guest: false }
  if (order.guestUser) {
    return { name: String(order.guestUser.name ?? ''), email: String(order.guestUser.email ?? ''), guest: true }
  }
  return null
}
