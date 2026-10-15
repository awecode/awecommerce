import { eq, sql } from 'drizzle-orm'
import { users } from '../../../../../auth/server/db/schema'

// Adds staff by email: the account with that email (in any case) becomes
// staff, or one is made with the staff role (named after the email unless a
// name is given). They sign in with the emailed link as usual.
export default defineServiceHandler(async (event) => {
  const { email, name } = await readValidatedBody(event, addStaffSchema.parse)
  const [existing] = await useDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
  const auth = useServerAuth()
  if (existing) {
    const { user } = await callAuth(() => auth.api.setRole({ body: { userId: existing.id, role: 'admin' }, headers: event.headers }))
    return { user, created: false }
  }
  const { user } = await callAuth(() =>
    auth.api.createUser({ body: { email: email.toLowerCase(), name: name ?? email.split('@')[0]!, role: 'admin' }, headers: event.headers }),
  )
  return { user, created: true }
})
