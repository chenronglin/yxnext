import "server-only"

export type PaginationInput = {
  page?: string | number | null
  pageSize?: string | number | null
}

export type PaginationResult = {
  page: number
  pageSize: number
  skip: number
  take: number
}

function toPositiveInteger(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export function parsePagination(input: PaginationInput = {}, maxPageSize = 100): PaginationResult {
  const page = toPositiveInteger(input.page, 1)
  const requestedPageSize = toPositiveInteger(input.pageSize, 20)
  const pageSize = Math.min(requestedPageSize, maxPageSize)

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

export function makePaginationMeta(total: number, pagination: Pick<PaginationResult, "page" | "pageSize">) {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  }
}
