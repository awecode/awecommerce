import type { RouterConfig } from '@nuxt/schema'

// Back and forward keep their place. A hash scrolls to its element only when
// it is an element id: the sign-in link carries its token in the hash
// (#token=…). Changing only the query (filters, sorting) keeps the place too;
// another page of results, or another page, starts at the top.
export default {
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (/^#[A-Za-z][\w-]*$/.test(to.hash)) return { el: to.hash }
    if (to.path !== from.path || to.query.page !== from.query.page) return { top: 0 }
  },
} satisfies RouterConfig
