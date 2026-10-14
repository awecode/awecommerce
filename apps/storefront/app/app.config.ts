// The storefront's look and the content that has no admin screen yet. The
// store's name, currency and locale come from the store settings (backoffice).
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'stone',
      neutral: 'stone',
    },
    button: {
      slots: { base: 'rounded-full' },
    },
  },
  store: {
    // An image URL; without one, the store name is shown in the header
    logo: '',
    tagline: 'Considered goods for everyday life.',
    // Used when a page does not set its own description
    description: 'Shop considered goods for everyday life, delivered to your door.',
    hero: {
      title: 'Made to be used, every day',
      text: 'A small collection of well-made things, chosen for how they wear, work and last.',
      image: '',
      cta: { label: 'Shop new arrivals', to: '/search' },
    },
    footer: {
      // Your own pages, such as { label: 'Shipping and returns', to: '/shipping' }
      links: [] as { label: string; to: string }[],
    },
  },
})
