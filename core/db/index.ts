import { config } from '../../config'
import { client as clientPg, db as dbPg } from './pg/db'
import { client as clientSqlite, db as dbSqlite } from './pg/db'

let client: typeof clientPg | typeof clientSqlite
let db: typeof dbPg | typeof dbSqlite

if (config.dbDialect === 'pg') {
  client = clientPg
  db = dbPg
} else {
  client = clientSqlite
  db = dbSqlite
}

export { client, db }
