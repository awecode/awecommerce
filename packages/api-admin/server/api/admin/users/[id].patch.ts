// Makes a user staff (admin) or a customer (user). An admin cannot remove
// their own admin role, so the backoffice always keeps one.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, userParams.parse)
  const { role } = await readValidatedBody(event, changeUserRoleSchema.parse)
  if (id === (await currentAdmin(event)).id && role !== 'admin') {
    throw createError({ statusCode: 422, statusMessage: 'Unprocessable Entity', message: 'You cannot remove your own admin role' })
  }
  const { user } = await callAuth(() =>
    useServerAuth().api.setRole({ body: { userId: id, role }, headers: event.headers }),
  )
  return user
})
