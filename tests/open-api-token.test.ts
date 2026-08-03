import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { assertOpenProjectsApiToken } from "@/server/auth/open-api-token"
import { ApiError } from "@/server/shared/api-response"

const VALID_TOKEN = "open-projects-test-token-with-more-than-32-characters"

function makeRequest(authorization?: string) {
  return new NextRequest("https://example.test/api/open/projects", {
    headers: authorization ? { Authorization: authorization } : undefined,
  })
}

describe("Open API Token 鉴权", () => {
  afterEach(() => {
    // 每条用例都恢复环境变量，避免 Token 配置泄漏到其他测试文件。
    delete process.env.OPEN_PROJECTS_API_TOKEN
  })

  it("接受格式正确且值匹配的 Bearer Token", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN

    expect(() => assertOpenProjectsApiToken(makeRequest(`Bearer ${VALID_TOKEN}`))).not.toThrow()
  })

  it("对缺失、格式错误和不匹配的 Token 返回相同认证错误", () => {
    process.env.OPEN_PROJECTS_API_TOKEN = VALID_TOKEN

    for (const request of [makeRequest(), makeRequest(`Basic ${VALID_TOKEN}`), makeRequest("Bearer wrong-token")]) {
      try {
        assertOpenProjectsApiToken(request)
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
      assertOpenProjectsApiToken(makeRequest("Bearer short-token"))
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
