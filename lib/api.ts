export class ApiRequestError extends Error {
  public readonly status: number
  public readonly code?: string
  public readonly details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
    this.details = details
  }
}

// 客户端统一解析 API 外壳；失败时抛出结构化错误，页面只需要展示 message。
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiRequestError(
      payload?.message ?? "请求失败，请稍后重试",
      response.status,
      payload?.code,
      payload?.details,
    )
  }

  return payload as T
}
