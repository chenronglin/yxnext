import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { ApiError } from "@/server/shared/api-response"

const { mockAssertOpenProjectsApiToken, mockListOpenProjects } = vi.hoisted(() => ({
  mockAssertOpenProjectsApiToken: vi.fn(),
  mockListOpenProjects: vi.fn(),
}))

vi.mock("@/server/auth/open-api-token", () => ({
  assertOpenProjectsApiToken: mockAssertOpenProjectsApiToken,
}))

vi.mock("@/server/modules/open/open-project.service", () => ({
  listOpenProjects: mockListOpenProjects,
}))

import { GET } from "@/app/api/open/projects/route"

describe("Agent 项目只读接口", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertOpenProjectsApiToken.mockImplementation(() => undefined)
    mockListOpenProjects.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    })
  })

  it("默认关闭章节明细并返回禁止缓存响应头", async () => {
    const request = new NextRequest("https://example.test/api/open/projects", {
      headers: { Authorization: "Bearer test-token" },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mockAssertOpenProjectsApiToken).toHaveBeenCalledWith(request)
    expect(mockListOpenProjects).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      updatedSince: null,
      includeChapters: false,
    })
    expect(payload).toMatchObject({ ok: true, items: [] })
  })

  it("把分页、增量时间和章节开关转换为强类型服务参数", async () => {
    const request = new NextRequest(
      "https://example.test/api/open/projects?page=2&pageSize=50&updatedSince=2026-08-01T00%3A00%3A00.000%2B08%3A00&includeChapters=true",
      { headers: { Authorization: "Bearer test-token" } },
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockListOpenProjects).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      updatedSince: new Date("2026-08-01T00:00:00.000+08:00"),
      includeChapters: true,
    })
  })

  it("拒绝无时区时间戳和超过上限的分页参数", async () => {
    for (const query of ["updatedSince=2026-08-01T00:00:00", "pageSize=101", "includeChapters=yes"]) {
      const request = new NextRequest(`https://example.test/api/open/projects?${query}`, {
        headers: { Authorization: "Bearer test-token" },
      })
      const response = await GET(request)
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload).toMatchObject({ ok: false, code: "VALIDATION_ERROR" })
    }

    expect(mockListOpenProjects).not.toHaveBeenCalled()
  })

  it("认证失败时返回 Bearer 认证提示且不查询数据库", async () => {
    mockAssertOpenProjectsApiToken.mockImplementationOnce(() => {
      throw new ApiError({
        status: 401,
        code: "OPEN_API_UNAUTHORIZED",
        message: "Open API Token 无效",
      })
    })
    const request = new NextRequest("https://example.test/api/open/projects")

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe("Bearer")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(payload).toMatchObject({ ok: false, code: "OPEN_API_UNAUTHORIZED" })
    expect(mockListOpenProjects).not.toHaveBeenCalled()
  })
})
