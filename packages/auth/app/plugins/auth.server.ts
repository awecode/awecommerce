import { getSessionCookie } from 'better-auth/cookies'
import { sessionForClient } from '#layers/auth/shared/sessionForClient'

export default defineNuxtPlugin({
  name: 'better-auth-fetch-plugin',
  enforce: 'pre',
  async setup(nuxtApp) {
    // Flag if request is cached
    nuxtApp.payload.isCached = Boolean(useRequestEvent()?.context.cache)
    if (nuxtApp.payload.serverRendered && !nuxtApp.payload.prerenderedAt && !nuxtApp.payload.isCached) {
      const event = useRequestEvent()
      if (!event || getSessionCookie(event.headers) === null)
        return

      const { getAuthSession } = await import('#layers/auth/server/utils/session')
      const data = await getAuthSession(event)
      // Typed from the session, so the state can hold it (not just null)
      const session = useState<ReturnType<typeof sessionForClient<NonNullable<typeof data>['session']>>>('auth:session', () => null)
      const user = useState<NonNullable<typeof data>['user'] | null>('auth:user', () => null)
      session.value = sessionForClient(data?.session)
      user.value = data?.user ?? null
    }
  },
})
