type PaginationArgs = {
  page: number
  size: number
}

type Paginated<Row> = {
  results: Row[]
  pagination: PaginationArgs & { total: number; pages: number }
}

// What a list returns for filter F: one page when `pagination` is passed,
// every row when it is not, and either when the caller's type allows both
type ListResult<F, Row> = 'pagination' extends keyof F
  ? F extends { pagination: PaginationArgs }
    ? Paginated<Row>
    : F extends { pagination: undefined }
      ? Row[]
      : Row[] | Paginated<Row>
  : Row[]

// The filter F, with keys that Shape does not have typed as never. Inferring F
// from an object literal skips the usual check for unknown keys; this puts it back.
type Exact<F, Shape> = F & Record<Exclude<keyof F, keyof Shape>, never>

// Runs a list query: every row without pagination, or one page and the total
// with it. `rows` fetches every row, or the page when given a limit and offset.
const paginate = async <F extends { pagination?: PaginationArgs }, Row>(
  filter: F | undefined,
  rows: (page?: { limit: number; offset: number }) => PromiseLike<Row[]>,
  count: () => PromiseLike<number>,
): Promise<ListResult<F, Row>> => {
  if (!filter?.pagination) {
    return (await rows()) as ListResult<F, Row>
  }
  const { page, size } = filter.pagination
  const results = await rows({ limit: size, offset: (page - 1) * size })
  const total = await count()
  return {
    results,
    pagination: { page, size, total, pages: Math.ceil(total / size) },
  } as ListResult<F, Row>
}

export { paginate }
export type { Exact, ListResult, Paginated, PaginationArgs }
