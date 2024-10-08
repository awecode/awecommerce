import { dialect, type dialectType } from '../../config'
import { client as clientPg, db as dbPg } from './pg/db'
import { db as dbSqlite } from './sqlite/db'

let client
let theDb

if (dialect === 'pg') {
  client = clientPg
  theDb = dbPg
} else {
  theDb = dbSqlite
}

const db = theDb as dialectType

export { client, db }
