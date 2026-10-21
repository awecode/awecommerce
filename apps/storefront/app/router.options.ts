import type { RouterConfig } from '@nuxt/schema'

// Back and forward keep their place. A hash scrolls to its element only when
// it is an element id: the sign-in link carries its token in the hash
// (#token=…). Changing only the query (filters, sorting) keeps the place too;
// another page of results, or another page, starts at the top.
// Going to another page, the move waits until that page is on screen.
// Otherwise the address changes and the page you were on jumps to the top
// while the next one loads. On the same page no page hook fires, so the move
// is made at once.
export default {
  scrollBehavior: (to, from, savedPosition) => {
    const nuxtApp = useNuxtApp()
    const position = savedPosition
      ?? (/^#[A-Za-z][\w-]*$/.test(to.hash) ? { el: to.hash } : undefined)
      ?? (to.path !== from.path || to.query.page !== from.query.page ? { top: 0 } : false)

    if (nuxtApp.isHydrating || to.path === from.path) return position

    return new Promise((resolve) => {
      nuxtApp.hooks.hookOnce('page:finish', () => {
        requestAnimationFrame(() => resolve(position))
      })
    })
  },
} satisfies RouterConfig
