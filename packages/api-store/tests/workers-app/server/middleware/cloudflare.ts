// What Nitro's Cloudflare presets put on each request: the Worker's bindings,
// here a Hyperdrive binding to the test database
export default defineEventHandler((event) => {
  event.context.cloudflare = {
    env: { HYPERDRIVE: { connectionString: process.env.TEST_HYPERDRIVE_URL } },
    context: { waitUntil: () => {} },
  }
})
