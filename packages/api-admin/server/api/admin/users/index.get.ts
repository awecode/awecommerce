// Users (customers and staff), newest first, one page at a time
export default defineServiceHandler(async (event) => {
  const { q, role, page, size } = await getValidatedQuery(event, userListQuery.parse)
  const { users, total } = await callAuth(() =>
    useServerAuth().api.listUsers({
      query: {
        searchValue: q,
        searchField: 'email',
        filterField: role ? 'role' : undefined,
        filterValue: role,
        limit: size,
        offset: (page - 1) * size,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
      headers: event.headers,
    }),
  )
  return { results: users, pagination: { page, size, total, pages: Math.ceil(total / size) } }
})
