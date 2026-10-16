export default defineNitroPlugin((nitroApp) => {
  // A request's own connections (on Workers) close after its response
  nitroApp.hooks.hook('afterResponse', (event) => closeRequestDb(event))
  nitroApp.hooks.hook('close', closeDb)
})
