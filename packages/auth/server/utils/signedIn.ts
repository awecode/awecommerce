import type { users } from '../db/schema'

type SignedInListener = (payload: { user: typeof users.$inferSelect }) => void | Promise<void>

const listeners: SignedInListener[] = []

// Runs `listener` after every sign-in, with the user who signed in. Register
// listeners from a Nitro plugin.
export const onSignedIn = (listener: SignedInListener) => {
  listeners.push(listener)
}

// Called by the auth config once a sign-in has made its session
export const runSignedInListeners = async (payload: Parameters<SignedInListener>[0]) => {
  for (const listener of listeners) {
    await listener(payload)
  }
}
