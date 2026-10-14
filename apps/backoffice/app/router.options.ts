import type { RouterConfig } from '@nuxt/schema'

// The backoffice has no in-page anchors, and the sign-in link carries its token
// in the hash (#token=…), which the default would try to scroll to as an
// element. Back and forward keep their place; anything else starts at the top.
export default {
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
} satisfies RouterConfig
