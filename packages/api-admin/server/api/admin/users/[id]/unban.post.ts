export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, userParams.parse)
  const { user } = await callAuth(() =>
    useServerAuth().api.unbanUser({ body: { userId: id }, headers: event.headers }),
  )
  return user
})
