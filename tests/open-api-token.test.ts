import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import {
  assertOpenApiToken,
  assertOpenContentApiToken,
  assertOpenContentProjectAccess,
} from "@/server/auth/open-api-token"
import { ApiError } from "@/server/shared/api-response"

const VALID_TOKEN = "open-projects-test-token-with-more-than-32-characters"
const VALID_CONTENT_TOKEN = "open-content-test-token-with-more-than-32-characters"

function makeRequest(authorization?: string) {
  return new NextRequest("https://example.test/api/open/projects", {
    headers: authorization ? { Authorization: authorization } : undefined,
  })
}

describe("Open API Token 鉴权", () => {
  afterEach(() => {
    // 每条用例都恢复环境变量，避免 Token 配置泄漏到其他测试文件。
    delete process.env.OPEN_PROJECTS_API_TOKEN
    delete process.env.OPEN_CONTENT_API_TOKEN
    delete process.env.OPEN_CONTENT_API_CALLER
    delete process.env.OPEN_CONTENT_API_PROJECT_IDS
  })

  it("正文接口只接受独立内容 Token，并解析调用方与项目白名单", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN
    process.env.OPEN_CONTENT_API_TOKEN = VALID_CONTENT_TOKEN
    process.env.OPEN_CONTENT_API_CALLER = "agent-content-reader"
    process.env.OPEN_CONTENT_API_PROJECT_IDS = "100, 200"

    const principal = assertOpenContentApiToken(makeRequest(`Bearer ${VALID_CONTENT_TOKEN}`))

    expect(principal.caller).toBe("agent-content-reader")
    expect(principal.allowedProjectIds).toEqual(new Set(["100", "200"]))
    expect(() => assertOpenContentProjectAccess(principal, 100n)).not.toThrow()
    expect(() => assertOpenContentProjectAccess(principal, 300n)).toThrowError(
      expect.objectContaining({ status: 403, code: "OPEN_CONTENT_PROJECT_FORBIDDEN" }),
    )
  })

  it("元数据 Token 不能读取正文", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN
    process.env.OPEN_CONTENT_API_TOKEN = VALID_CONTENT_TOKEN

    expect(() => assertOpenContentApiToken(makeRequest(`Bearer ${VALID_TOKEN}`))).toThrowError(
      expect.objectContaining({ status: 401, code: "OPEN_CONTENT_API_UNAUTHORIZED" }),
    )
  })

  it("两个 Token 配置成相同值时关闭正文接口", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN
    process.env.OPEN_CONTENT_API_TOKEN = VALID_TOKEN

    expect(() => assertOpenContentApiToken(makeRequest(`Bearer ${VALID_TOKEN}`))).toThrowError(
      expect.objectContaining({ status: 503, code: "OPEN_CONTENT_API_TOKEN_SCOPE_CONFLICT" }),
    )
  })

  it("正文 Token 缺失、过短或项目白名单非法时关闭接口", () => {
    process.env.OPEN_CONTENT_API_TOKEN = "short-token"
    expect(() => assertOpenContentApiToken(makeRequest("Bearer short-token"))).toThrowError(
      expect.objectContaining({ status: 503, code: "OPEN_CONTENT_API_TOKEN_NOT_CONFIGURED" }),
    )

    process.env.OPEN_CONTENT_API_TOKEN = VALID_CONTENT_TOKEN
    process.env.OPEN_CONTENT_API_PROJECT_IDS = "100,not-an-id"
    expect(() => assertOpenContentApiToken(makeRequest(`Bearer ${VALID_CONTENT_TOKEN}`))).toThrowError(
      expect.objectContaining({ status: 503, code: "OPEN_CONTENT_API_SCOPE_INVALID" }),
    )
  })

  it("接受格式正确且值匹配的 Bearer Token", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN

    expect(() => assertOpenApiToken(makeRequest(`Bearer ${VALID_TOKEN}`))).not.toThrow()
  })

  it("对缺失、格式错误和不匹配的 Token 返回相同认证错误", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN

    for (const request of [makeRequest(), makeRequest(`Basic ${VALID_TOKEN}`), makeRequest("Bearer wrong-token")]) {
      try {
        assertOpenApiToken(request)
        throw new Error("测试预期鉴权失败，但函数没有抛出错误")
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({
          status: 401,
          code: "OPEN_API_UNAUTHORIZED",
        })
      }
    }
  })

  it("Token 未配置或长度不足时关闭接口", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = "short-token"

    try {
      assertOpenApiToken(makeRequest("Bearer short-token"))
      throw new Error("测试预期配置错误，但函数没有抛出错误")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({
        status: 503,
        code: "OPEN_API_TOKEN_NOT_CONFIGURED",
      })
    }
  })
})
