// Users (customers and staff), newest first, one page at a time: by role, or
// banned ones (one of the two)
export default defineServiceHandler(async (event) => {
  const { q, role, banned, page, size } = await getValidatedQuery(event, userListQuery.parse)
  const filter = banned !== undefined ? { filterField: 'banned', filterValue: banned } : role ? { filterField: 'role', filterValue: role } : {}
  const { users, total } = await callAuth(() =>
    useServerAuth().api.listUsers({
      query: {
        searchValue: q,
        searchField: 'email',
        ...filter,
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
