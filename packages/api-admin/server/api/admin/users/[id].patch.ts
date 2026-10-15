// Changes a user's role (staff `admin` or customer `user`) and name. An admin
// cannot remove their own admin role, so the backoffice always keeps one.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, userParams.parse)
  const { role, name } = await readValidatedBody(event, updateUserSchema.parse)
  if (role !== undefined && id === (await currentAdmin(event)).id && role !== 'admin') {
    throw createError({ statusCode: 422, statusMessage: 'Unprocessable Entity', message: 'You cannot remove your own admin role' })
  }
  const auth = useServerAuth()
  let user
  if (role !== undefined) {
    user = (await callAuth(() => auth.api.setRole({ body: { userId: id, role }, headers: event.headers }))).user
  }
  if (name !== undefined) {
    user = await callAuth(() => auth.api.adminUpdateUser({ body: { userId: id, data: { name } }, headers: event.headers }))
  }
  return user
})
