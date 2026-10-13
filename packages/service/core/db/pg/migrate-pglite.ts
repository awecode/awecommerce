import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import {
    drizzle as drizzlePglite
} from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

const client = new PGlite({
  extensions: { uuid_ossp },
})
const drizzle = drizzlePglite(client)
migrate(drizzle, {
  migrationsFolder: './migrations/pg',
})
