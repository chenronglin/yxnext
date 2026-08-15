import "server-only"

import { createHash, randomUUID, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

import { ApiError } from "@/server/shared/api-response"
import type { OpenContentAuditContext, OpenContentPrincipal } from "@/types/open-content"

const METADATA_TOKEN_ENV_NAME = "OPEN_PROJECTS_API_TOKEN"
const CONTENT_TOKEN_ENV_NAME = "OPEN_CONTENT_API_TOKEN"
const MINIMUM_TOKEN_LENGTH = 32

function tokenDigest(value: string) {
  // 固定长度摘要让 timingSafeEqual 的两个输入始终等长，避免错误长度提前暴露比较结果。
  return createHash("sha256").update(value, "utf8").digest()
}

function configuredToken(envName: string, missingCode: string, missingMessage: string) {
  const token = process.env[envName]?.trim()

  // Token 未配置或强度明显不足时直接关闭接口，防止部署遗漏配置后意外形成弱认证入口。
  if (!token || token.length < MINIMUM_TOKEN_LENGTH) {
    throw new ApiError({
      status: 503,
      code: missingCode,
      message: missingMessage,
    })
  }

  return token
}

function bearerToken(request: NextRequest, errorCode: string, errorMessage: string) {
  const authorization = request.headers.get("authorization")
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)

  // 缺失、格式错误和 Token 错误共用同一个外部错误，避免向调用方泄露鉴权细节。
  if (!match?.[1]) {
    throw new ApiError({
      status: 401,
      code: errorCode,
      message: errorMessage,
    })
  }

  return match[1]
}

// 该鉴权函数只会被 /api/open 下的只读 Route 显式调用。
// 现有管理员和业务接口不会识别这个 Token，因此它不能被用于任何新增、修改或删除操作。
export function assertOpenApiToken(request: NextRequest) {
  const expectedDigest = tokenDigest(
    configuredToken(METADATA_TOKEN_ENV_NAME, "OPEN_API_TOKEN_NOT_CONFIGURED", "Open API Token 未正确配置"),
  )
  const actualDigest = tokenDigest(bearerToken(request, "OPEN_API_UNAUTHORIZED", "Open API Token 无效"))

  if (!timingSafeEqual(expectedDigest, actualDigest)) {
    throw new ApiError({
      status: 401,
      code: "OPEN_API_UNAUTHORIZED",
      message: "Open API Token 无效",
    })
  }
}

function configuredContentCaller() {
  const caller = process.env.OPEN_CONTENT_API_CALLER?.trim() || "external-content-agent"

  if (caller.length > 100) {
    throw new ApiError({
      status: 503,
      code: "OPEN_CONTENT_API_CALLER_INVALID",
      message: "正文 Open API 调用方标识配置不正确",
    })
  }

  return caller
}

function configuredContentProjectIds(): ReadonlySet<string> | null {
  const configured = process.env.OPEN_CONTENT_API_PROJECT_IDS?.trim()
  if (!configured) return null

  const values = configured.split(",").map((value) => value.trim())
  if (values.some((value) => !/^[1-9]\d*$/.test(value))) {
    throw new ApiError({
      status: 503,
      code: "OPEN_CONTENT_API_SCOPE_INVALID",
      message: "正文 Open API 项目授权配置不正确",
    })
  }

  return new Set(values)
}

// 正文属于核心 IP，必须使用与元数据接口不同的独立 Token。
// 如果部署时误把两个环境变量设成相同值，接口直接关闭，避免“名义分权、实际共钥”。
export function assertOpenContentApiToken(request: NextRequest): OpenContentPrincipal {
  const contentToken = configuredToken(
    CONTENT_TOKEN_ENV_NAME,
    "OPEN_CONTENT_API_TOKEN_NOT_CONFIGURED",
    "正文 Open API Token 未正确配置",
  )
  const metadataToken = process.env[METADATA_TOKEN_ENV_NAME]?.trim()

  if (metadataToken && timingSafeEqual(tokenDigest(contentToken), tokenDigest(metadataToken))) {
    throw new ApiError({
      status: 503,
      code: "OPEN_CONTENT_API_TOKEN_SCOPE_CONFLICT",
      message: "正文 Token 不能与元数据 Token 相同",
    })
  }

  const actualToken = bearerToken(request, "OPEN_CONTENT_API_UNAUTHORIZED", "正文 Open API Token 无效")
  if (!timingSafeEqual(tokenDigest(contentToken), tokenDigest(actualToken))) {
    throw new ApiError({
      status: 401,
      code: "OPEN_CONTENT_API_UNAUTHORIZED",
      message: "正文 Open API Token 无效",
    })
  }

  return {
    caller: configuredContentCaller(),
    allowedProjectIds: configuredContentProjectIds(),
  }
}

export function assertOpenContentProjectAccess(principal: OpenContentPrincipal, projectId: bigint) {
  if (!principal.allowedProjectIds || principal.allowedProjectIds.has(projectId.toString())) return

  throw new ApiError({
    status: 403,
    code: "OPEN_CONTENT_PROJECT_FORBIDDEN",
    message: "当前正文 Token 无权读取该项目",
  })
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null
}

function limitedHeaderValue(value: string | null, maxLength: number) {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

// 审计上下文只保留调用识别所需字段，不保存 Authorization 请求头，也不保存任何正文内容。
export function openContentAuditContext(
  request: NextRequest,
  principal: OpenContentPrincipal,
): OpenContentAuditContext {
  return {
    caller: principal.caller,
    requestId: limitedHeaderValue(request.headers.get("x-request-id"), 128) ?? randomUUID(),
    ipAddress:
      limitedHeaderValue(firstHeaderValue(request.headers.get("x-forwarded-for")), 64) ??
      limitedHeaderValue(request.headers.get("x-real-ip"), 64),
    userAgent: limitedHeaderValue(request.headers.get("user-agent"), 500),
  }
}
