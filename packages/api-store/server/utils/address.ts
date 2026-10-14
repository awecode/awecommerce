import { z } from 'zod'

export const addressParams = z.object({ id: z.coerce.number().int() })
