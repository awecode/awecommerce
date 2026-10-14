// Bans a user and signs them out everywhere. Admins cannot ban themselves.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, userParams.parse)
  const { reason, days } = await readValidatedBody(event, banUserSchema.parse)
  const { user } = await callAuth(() =>
    useServerAuth().api.banUser({
      body: { userId: id, banReason: reason, banExpiresIn: days ? days * 24 * 60 * 60 : undefined },
      headers: event.headers,
    }),
  )
  return user
})
