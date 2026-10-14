// The backoffice is for staff. A signed-in customer sees the no-access page
// instead of screens whose API calls would all be refused. Runs after the auth
// layer's middleware, which sends guests to /login.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useAuth()
  if (to.meta.auth === false || to.path === '/no-access' || !loggedIn.value) {
    return
  }
  if (user.value?.role !== 'admin') {
    return navigateTo('/no-access')
  }
})
