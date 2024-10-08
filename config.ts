import { type LibSQLDatabase } from 'drizzle-orm/libsql'
import { type PgDatabase } from './core/db/pg/db'

type Dialect = 'pg' | 'sqlite'

export const dialect: Dialect = 'sqlite'
export type dialectType = LibSQLDatabase

// export const dialect: Dialect = 'pg'
// export type dialectType = PgDatabase
