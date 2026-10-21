import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthBaseURL, resolveAuthBaseURL } from '../server/utils/authBaseUrl'

describe('resolveAuthBaseURL', () => {
  it('uses the first configured URL', () => {
    expect(resolveAuthBaseURL([
      'https://auth.example',
      'https://public.example',
    ])).toBe('https://auth.example')
  })

  it('falls through empty values to the public URL', () => {
    expect(resolveAuthBaseURL([
      '',
      undefined,
      'https://public.example',
    ])).toBe('https://public.example')
  })

  it('refuses to run without a configured URL', () => {
    expect(() => resolveAuthBaseURL([undefined, '', undefined]))
      .toThrow('Set BETTER_AUTH_URL or NUXT_PUBLIC_BASE_URL')
  })
})

describe('getAuthBaseURL', () => {
  const config = { auth: {} as Record<string, unknown>, public: { siteUrl: 'https://shop.example' } as Record<string, unknown> }
  vi.stubGlobal('useRuntimeConfig', () => config)
  const saved = process.env.BETTER_AUTH_URL
  beforeEach(() => {
    delete process.env.BETTER_AUTH_URL
    config.auth = {}
  })
  afterAll(() => {
    process.env.BETTER_AUTH_URL = saved
  })

  it('uses the site URL only in an app that allows it', () => {
    expect(() => getAuthBaseURL()).toThrow('Set BETTER_AUTH_URL')
    config.auth = { baseURLFromSiteURL: true }
    expect(getAuthBaseURL()).toBe('https://shop.example')
  })

  it('prefers BETTER_AUTH_URL to the site URL', () => {
    config.auth = { baseURLFromSiteURL: true }
    process.env.BETTER_AUTH_URL = 'https://auth.example'
    expect(getAuthBaseURL()).toBe('https://auth.example')
  })
})
