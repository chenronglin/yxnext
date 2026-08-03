import "server-only"

import { createHash, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

import { ApiError } from "@/server/shared/api-response"

const TOKEN_ENV_NAME = "OPEN_PROJECTS_API_TOKEN"
const MINIMUM_TOKEN_LENGTH = 32

function tokenDigest(value: string) {
  // 固定长度摘要让 timingSafeEqual 的两个输入始终等长，避免错误长度提前暴露比较结果。
  return createHash("sha256").update(value, "utf8").digest()
}

function configuredToken() {
  const token = process.env[TOKEN_ENV_NAME]?.trim()

  // Token 未配置或强度明显不足时直接关闭接口，防止部署遗漏配置后意外形成弱认证入口。
  if (!token || token.length < MINIMUM_TOKEN_LENGTH) {
    throw new ApiError({
      status: 503,
      code: "OPEN_API_TOKEN_NOT_CONFIGURED",
      message: "Open API Token 未正确配置",
    })
  }

  return token
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)

  // 缺失、格式错误和 Token 错误共用同一个外部错误，避免向调用方泄露鉴权细节。
  if (!match?.[1]) {
    throw new ApiError({
      status: 401,
      code: "OPEN_API_UNAUTHORIZED",
      message: "Open API Token 无效",
    })
  }

  return match[1]
}

// 该鉴权函数只会被 /api/open 下的只读 Route 显式调用。
// 现有管理员和业务接口不会识别这个 Token，因此它不能被用于任何新增、修改或删除操作。
export function assertOpenProjectsApiToken(request: NextRequest) {
  const expectedDigest = tokenDigest(configuredToken())
  const actualDigest = tokenDigest(bearerToken(request))

  if (!timingSafeEqual(expectedDigest, actualDigest)) {
    throw new ApiError({
      status: 401,
      code: "OPEN_API_UNAUTHORIZED",
      message: "Open API Token 无效",
    })
  }
}
