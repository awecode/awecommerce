import { initializeDb } from './pg/db'

console.log('Initializing database...')
const db = initializeDb()

export { db }
