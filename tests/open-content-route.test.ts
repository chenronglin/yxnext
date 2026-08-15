import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { ApiError } from "@/server/shared/api-response"

const { mockAssertToken, mockAuditContext, mockGetDocContent, mockListProjectContent } = vi.hoisted(() => ({
  mockAssertToken: vi.fn(),
  mockAuditContext: vi.fn(),
  mockGetDocContent: vi.fn(),
  mockListProjectContent: vi.fn(),
}))

vi.mock("@/server/auth/open-api-token", () => ({
  assertOpenContentApiToken: mockAssertToken,
  openContentAuditContext: mockAuditContext,
}))

vi.mock("@/server/modules/open/open-content.service", () => ({
  getOpenDocContent: mockGetDocContent,
  listOpenProjectContent: mockListProjectContent,
}))

import { GET as getDocContent } from "@/app/api/open/docs/[docId]/content/route"
import { GET as getProjectContent } from "@/app/api/open/projects/[projectId]/content/route"

const principal = {
  caller: "agent-content-reader",
  allowedProjectIds: null,
}

const audit = {
  caller: "agent-content-reader",
  requestId: "request-001",
  ipAddress: null,
  userAgent: "content-client/1.0",
}

describe("Open Content 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertToken.mockReturnValue(principal)
    mockAuditContext.mockReturnValue(audit)
    mockGetDocContent.mockResolvedValue({
      docId: "101",
      projectId: "10",
      stage: "chapter",
      title: "第一章",
      order: 1,
      wordCount: 1200,
      updatedAt: "2026-08-15T08:00:00.000Z",
      content: "正文内容",
    })
    mockListProjectContent.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 1,
      total: 0,
      totalPages: 1,
    })
  })

  it("按 Doc 返回稳定字段，并对成功响应禁用缓存", async () => {
    const request = new NextRequest("https://example.test/api/open/docs/101/content", {
      headers: { Authorization: "Bearer content-token" },
    })

    const response = await getDocContent(request, { params: Promise.resolve({ docId: "101" }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mockAssertToken).toHaveBeenCalledWith(request)
    expect(mockAuditContext).toHaveBeenCalledWith(request, principal)
    expect(mockGetDocContent).toHaveBeenCalledWith({ docId: 101n, principal, audit })
    expect(payload).toMatchObject({ ok: true, docId: "101", projectId: "10", content: "正文内容" })
  })

  it("按项目阶段默认读取全部，并转换章序范围与分页参数", async () => {
    const allRequest = new NextRequest("https://example.test/api/open/projects/10/content?stage=outline", {
      headers: { Authorization: "Bearer content-token" },
    })
    const allResponse = await getProjectContent(allRequest, { params: Promise.resolve({ projectId: "10" }) })

    expect(allResponse.status).toBe(200)
    expect(allResponse.headers.get("cache-control")).toBe("private, no-store")
    expect(mockListProjectContent).toHaveBeenLastCalledWith({
      projectId: 10n,
      stage: "outline",
      orderRange: null,
      page: 1,
      pageSize: null,
      principal,
      audit,
    })

    const pageRequest = new NextRequest(
      "https://example.test/api/open/projects/10/content?stage=chapter&order=1-3&page=2&pageSize=1",
      { headers: { Authorization: "Bearer content-token" } },
    )
    const pageResponse = await getProjectContent(pageRequest, { params: Promise.resolve({ projectId: "10" }) })

    expect(pageResponse.status).toBe(200)
    expect(mockListProjectContent).toHaveBeenLastCalledWith({
      projectId: 10n,
      stage: "chapter",
      orderRange: { start: 1, end: 3 },
      page: 2,
      pageSize: 1,
      principal,
      audit,
    })
  })

  it("拒绝非法 ID、阶段、章序范围和不完整分页参数", async () => {
    const invalidDocRequest = new NextRequest("https://example.test/api/open/docs/not-an-id/content", {
      headers: { Authorization: "Bearer content-token" },
    })
    const invalidDocResponse = await getDocContent(invalidDocRequest, {
      params: Promise.resolve({ docId: "not-an-id" }),
    })
    expect(invalidDocResponse.status).toBe(400)

    const invalidProjectQueries = [
      "stage=release",
      "stage=outline&order=1-3",
      "stage=chapter&order=3-1",
      "stage=chapter&order=0",
      "stage=chapter&order=999999999999999999999",
      "stage=chapter&page=2",
      "stage=chapter&pageSize=101",
    ]
    for (const query of invalidProjectQueries) {
      const request = new NextRequest(`https://example.test/api/open/projects/10/content?${query}`, {
        headers: { Authorization: "Bearer content-token" },
      })
      const response = await getProjectContent(request, { params: Promise.resolve({ projectId: "10" }) })
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload).toMatchObject({ ok: false, code: "VALIDATION_ERROR" })
    }

    expect(mockGetDocContent).not.toHaveBeenCalled()
    expect(mockListProjectContent).not.toHaveBeenCalled()
  })

  it("认证失败时返回 Bearer 提示、禁止缓存且不读取正文", async () => {
    mockAssertToken.mockImplementation(() => {
      throw new ApiError({
        status: 401,
        code: "OPEN_CONTENT_API_UNAUTHORIZED",
        message: "正文 Open API Token 无效",
      })
    })
    const request = new NextRequest("https://example.test/api/open/docs/101/content")

    const response = await getDocContent(request, { params: Promise.resolve({ docId: "101" }) })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe("Bearer")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(payload).toMatchObject({ ok: false, code: "OPEN_CONTENT_API_UNAUTHORIZED" })
    expect(mockGetDocContent).not.toHaveBeenCalled()
  })
})
