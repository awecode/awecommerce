export function resolveAuthBaseURL(configured: Array<string | undefined>) {
  const baseURL = configured.find(value => typeof value === 'string' && value.length > 0)
  if (!baseURL) {
    throw new Error('Set BETTER_AUTH_URL or NUXT_PUBLIC_BASE_URL. Magic links must not use the request host.')
  }
  return baseURL
}

export function getAuthBaseURL() {
  let runtimeBaseURL: string | undefined
  // An app served at its site URL (the storefront) can leave BETTER_AUTH_URL
  // unset: `auth.baseURLFromSiteURL` lets the site URL stand in. Not on the
  // backoffice, whose site URL is the storefront's.
  let siteURL: string | undefined
  try {
    const config = useRuntimeConfig()
    const publicConfig = config.public as { baseURL?: unknown; siteUrl?: unknown }
    if (typeof publicConfig.baseURL === 'string')
      runtimeBaseURL = publicConfig.baseURL
    if ((config.auth as { baseURLFromSiteURL?: unknown } | undefined)?.baseURLFromSiteURL === true && typeof publicConfig.siteUrl === 'string')
      siteURL = publicConfig.siteUrl
  }
  catch {
    // Nuxt runtime is unavailable, for example during the auth schema CLI.
  }

  return resolveAuthBaseURL([
    process.env.BETTER_AUTH_URL,
    process.env.NUXT_PUBLIC_BASE_URL,
    runtimeBaseURL,
    siteURL,
  ])
}
