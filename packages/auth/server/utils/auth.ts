import { betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getAuthBaseURL } from './authBaseUrl'
import { createAuthConfig } from './auth.config'
// import { runtime } from 'std-env'

function getAuthOptions() {
  return {
    ...createAuthConfig(),
    baseURL: getAuthBaseURL(),
  }
}

export const createBetterAuth = () => betterAuth(getAuthOptions())

let _auth: ReturnType<typeof createBetterAuth>
// For better-auth cli to generate schema. It only reads the options, so a
// Drizzle instance without a connection is enough.
const isAuthSchemaCommand = process.argv.some(arg => arg == 'generate')
if (isAuthSchemaCommand) {
  _auth = betterAuth({ ...createAuthConfig(drizzle.mock()), baseURL: getAuthBaseURL() })
}
export const auth = _auth!

// export const useServerAuth = () => {
//   if (runtime === 'node') {
//     if (!_auth) {
//       _auth = createBetterAuth()
//     }
//     return _auth
//   }
//   else {
//     return createBetterAuth()
//   }
// }

export const useServerAuth = () => {
  return createBetterAuth()
}

