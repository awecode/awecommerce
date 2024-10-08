import { type LibSQLDatabase } from 'drizzle-orm/libsql'
// import { type PgDatabase } from './core/db/pg/db'

export const dialect: 'pg' | 'sqlite' = 'sqlite'
export type dialectType = LibSQLDatabase
