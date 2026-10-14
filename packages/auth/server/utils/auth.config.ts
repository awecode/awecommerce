import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink, bearer, admin } from 'better-auth/plugins'
// import { createAuthMiddleware } from 'better-auth/api'
import { setAdminForEmail } from '../lib/hook-utils'
// The app's database, from the api-core layer
import { useDb } from '../../../api-core/server/utils/db'

import { sendMagicLinkEmail } from './email'
import { toMagicLinkConfirmUrl } from './magicLinkConfirmUrl'
import type { BetterAuthOptions } from 'better-auth'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { runSignedInListeners } from './signedIn'

// `db` is replaceable so the schema CLI can run without a database connection
// `satisfies` rather than a return type, so the plugins' types (the admin
// `role`, the magic link endpoints) reach betterAuth()
export function createAuthConfig(db: Parameters<typeof drizzleAdapter>[0] = useDb()) {
  return {
    emailAndPassword: {
      enabled: false,
    },
    plugins: [
      bearer(),
      admin(),
      magicLink({
        // Store a SHA-256 hash. The email still receives the plaintext token.
        storeToken: 'hashed',
        sendMagicLink: async ({ email, token, url }, request) => {
          // Do not email the raw /magic-link/verify GET URL. Scanners prefetch it
          // and burn the one-time token. Paste-token login still works because
          // the plain token in the email body is not fetched.
          const confirmUrl = toMagicLinkConfirmUrl(url, token)
          await sendMagicLinkEmail(email, token, confirmUrl, request)
        },
      }),
    ],
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
    }),
    // hooks: {
    //   before: createAuthMiddleware(async (ctx) => {
    //     // Only allow emails from configured domains as users
    //     allowDomains(ctx)
    //     // Only allow configured emails as users
    //     allowEmails(ctx)
    //   }),
    // },
    databaseHooks: {
      session: {
        create: {
          // Every sign-in makes a session. Other layers react through
          // onSignedIn, so this layer needs to know nothing about them (the
          // store links earlier guest orders, for example).
          after: async (session) => {
            const [user] = await db.select().from(users).where(eq(users.id, session.userId))
            if (user) {
              await runSignedInListeners({ user })
            }
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            // Staff sign in through the same users table: emails in
            // NUXT_AUTH_ADMIN_EMAILS get the admin role when first created
            return setAdminForEmail(user)
          },
        },
      },
    },
  } satisfies BetterAuthOptions
}
