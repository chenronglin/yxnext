import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { ApiError } from "@/server/shared/api-response"

const { mockAssertOpenApiToken, mockListOpenAuditLogs } = vi.hoisted(() => ({
  mockAssertOpenApiToken: vi.fn(),
  mockListOpenAuditLogs: vi.fn(),
}))

vi.mock("@/server/auth/open-api-token", () => ({
  assertOpenApiToken: mockAssertOpenApiToken,
}))

vi.mock("@/server/modules/open/open-audit.service", () => ({
  listOpenAuditLogs: mockListOpenAuditLogs,
}))

import { GET } from "@/app/api/open/audit-logs/route"

describe("Agent 审计日志只读接口", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertOpenApiToken.mockImplementation(() => undefined)
    mockListOpenAuditLogs.mockResolvedValue({
      logs: [],
      actions: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    })
  })

  it("使用与项目接口相同的 Token，并应用默认分页与空筛选", async () => {
    const request = new NextRequest("https://example.test/api/open/audit-logs", {
      headers: { Authorization: "Bearer test-token" },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mockAssertOpenApiToken).toHaveBeenCalledWith(request)
    expect(mockListOpenAuditLogs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      projectId: null,
      docId: null,
      actorId: null,
      operator: null,
      action: null,
      startAt: null,
      endAt: null,
      updatedSince: null,
    })
    expect(payload).toMatchObject({ ok: true, logs: [], actions: [] })
  })

  it("把项目、Doc、操作人、动作和时间条件转换为强类型参数", async () => {
    const request = new NextRequest(
      "https://example.test/api/open/audit-logs?page=2&pageSize=50&projectId=100&docId=200&actorId=300&operator=%E7%BC%96%E8%BE%91%E7%94%B2&action=doc.return&startAt=2026-08-01T00%3A00%3A00.000Z&endAt=2026-08-10T23%3A59%3A59.999Z&updatedSince=2026-08-05T00%3A00%3A00.000Z",
      { headers: { Authorization: "Bearer test-token" } },
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockListOpenAuditLogs).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      projectId: 100n,
      docId: 200n,
      actorId: 300n,
      operator: "编辑甲",
      action: "doc.return",
      startAt: new Date("2026-08-01T00:00:00.000Z"),
      endAt: new Date("2026-08-10T23:59:59.999Z"),
      updatedSince: new Date("2026-08-05T00:00:00.000Z"),
    })
  })

  it("拒绝非法 ID、无时区时间、反向时间范围和超大分页", async () => {
    const invalidQueries = [
      "projectId=abc",
      "docId=0",
      "updatedSince=2026-08-01T00:00:00",
      "startAt=2026-08-10T00%3A00%3A00.000Z&endAt=2026-08-01T00%3A00%3A00.000Z",
      "pageSize=101",
    ]

    for (const query of invalidQueries) {
      const request = new NextRequest(`https://example.test/api/open/audit-logs?${query}`, {
        headers: { Authorization: "Bearer test-token" },
      })
      const response = await GET(request)
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload).toMatchObject({ ok: false, code: "VALIDATION_ERROR" })
    }

    expect(mockListOpenAuditLogs).not.toHaveBeenCalled()
  })

  it("认证失败时返回 Bearer 提示且不读取审计日志", async () => {
    mockAssertOpenApiToken.mockImplementationOnce(() => {
      throw new ApiError({
        status: 401,
        code: "OPEN_API_UNAUTHORIZED",
        message: "Open API Token 无效",
      })
    })
    const request = new NextRequest("https://example.test/api/open/audit-logs")

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe("Bearer")
    expect(payload).toMatchObject({ ok: false, code: "OPEN_API_UNAUTHORIZED" })
    expect(mockListOpenAuditLogs).not.toHaveBeenCalled()
  })
})
