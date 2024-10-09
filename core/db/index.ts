import { dialect, type dialectType } from '../../config'
import { initializeDb as initializePg } from './pg/db'
import { initializeDb as initializeSqlite } from './sqlite/db'

let theDb

if (!theDb) {
  console.log('Initializing database...') 
  if (dialect === 'pg') {
    theDb = initializePg()
} else {
    theDb = initializeSqlite()
  }
}

const db = theDb as dialectType

export { db }
