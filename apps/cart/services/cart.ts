import { db } from 'core/db'
import { carts } from '../schemas'

export const cartService = {
  create: async (userId: string) => {
    const result = await db.insert(carts).values({ userId }).returning()
    return result[0]
  },
}
