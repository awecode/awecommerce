import type { H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as librarySchema from '@awecommerce/service/core/db/pg/schema'
import * as authSchema from '../../../auth/server/db/schema'

// The library's tables and the auth layer's (users, sessions, ...), which
// Better Auth's Drizzle adapter looks up here
const schema = { ...librarySchema, ...authSchema }

type Db = ReturnType<typeof drizzle<typeof schema>>
type Hyperdrive = { connectionString: string }
type RequestContext = { cloudflare?: { env?: { HYPERDRIVE?: Hyperdrive } }; db?: Db; dbPool?: pg.Pool }

// The request being handled, if any (Nitro's async context)
const currentEvent = (): H3Event | undefined => {
  try {
    return useEvent()
  } catch {
    return undefined
  }
}

// On Cloudflare Workers, a Hyperdrive binding named HYPERDRIVE: on the
// request, in Nitro's __env__, or global
const hyperdrive = (event?: H3Event): Hyperdrive | undefined => {
  const globals = globalThis as { HYPERDRIVE?: Hyperdrive; __env__?: { HYPERDRIVE?: Hyperdrive } }
  return [(event?.context as RequestContext | undefined)?.cloudflare?.env?.HYPERDRIVE, globals.__env__?.HYPERDRIVE, globals.HYPERDRIVE].find(
    (binding) => typeof binding?.connectionString === 'string',
  )
}

// The Hyperdrive binding's connection string when there is one, else
// NUXT_POSTGRES_URL
const connectionString = (event?: H3Event): string => {
  const binding = hyperdrive(event)
  if (binding) return binding.connectionString
  const { postgresUrl } = useRuntimeConfig()
  if (!postgresUrl) {
    throw new Error('NUXT_POSTGRES_URL is not set, and there is no Hyperdrive binding')
  }
  return postgresUrl
}

const onWorkers = () => (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'

let pool: pg.Pool | undefined
let db: Db | undefined

// The database, for Node and Cloudflare Workers alike.
// - Node: one pool for the server, opened on first use.
// - Workers: a connection cannot be used by another request, so each request
//   gets a small pool of its own (Hyperdrive does the real pooling), closed
//   after the response by closeRequestDb. Outside a request (a scheduled
//   task), each call gets its own.
export const useDb = (): Db => {
  const event = currentEvent()
  const context = event?.context as RequestContext | undefined
  if (context?.cloudflare || onWorkers()) {
    if (!context) {
      return drizzle(new pg.Pool({ connectionString: connectionString(), max: 1 }), { schema })
    }
    if (!context.db) {
      // Workers allow a few open connections per request
      context.dbPool = new pg.Pool({ connectionString: connectionString(event), max: 5 })
      context.db = drizzle(context.dbPool, { schema })
    }
    return context.db
  }
  if (!db) {
    pool = new pg.Pool({ connectionString: connectionString(event) })
    db = drizzle(pool, { schema })
  }
  return db
}

// Ends the request's own pool, if it has one; after the response, so the
// Worker keeps running until it is closed
export const closeRequestDb = (event: H3Event): void => {
  const context = event.context as RequestContext
  const requestPool = context.dbPool
  if (!requestPool) return
  context.dbPool = undefined
  context.db = undefined
  const ended = requestPool.end().catch((error) => console.error('Could not close the request\'s database connections', error))
  event.waitUntil?.(ended)
}

export const closeDb = async (): Promise<void> => {
  await pool?.end()
  pool = undefined
  db = undefined
}
