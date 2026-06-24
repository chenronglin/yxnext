import "server-only"

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ZodError } from "zod"

import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config"
import { translate } from "@/lib/i18n/dictionary"

type ApiErrorOptions = {
  status: number
  code: string
  message: string
  details?: unknown
}

// 业务层只抛 ApiError，HTTP 层统一在这里转换响应，避免每个 route.ts 重复写状态码分支。
export class ApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details?: unknown

  constructor(options: ApiErrorOptions) {
    super(options.message)
    this.name = "ApiError"
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

// 成功响应统一带 ok=true，方便前端后续做通用 fetch 包装时只认一个稳定外壳。
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init)
}

function localeFromRequest(request?: NextRequest) {
  // 错误响应不能再异步查数据库，否则会让每个 catch 分支都变复杂；
  // 这里只读取请求自带的 Cookie 和 Accept-Language，已登录用户的偏好会由语言 Cookie 同步兜底。
  if (!request) {
    return normalizeLocale(null)
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value

  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  return normalizeLocale(request.headers.get("accept-language"))
}

function localizeApiMessage(code: string, fallback: string, request?: NextRequest) {
  const locale = localeFromRequest(request)
  return translate(locale, `api.${code}`, undefined, fallback)
}

// 失败响应统一带 ok=false 和 code，页面可以根据 code 做精确提示或弹窗处理。
export function fail(error: unknown, request?: NextRequest) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: localizeApiMessage(error.code, error.message, request),
        details: error.details,
      },
      { status: error.status },
    )
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: localizeApiMessage("VALIDATION_ERROR", error.issues[0]?.message ?? "请求参数不正确", request),
        details: error.flatten(),
      },
      { status: 400 },
    )
  }

  console.error(error)

  return NextResponse.json(
    {
      ok: false,
      code: "INTERNAL_ERROR",
      message: localizeApiMessage("INTERNAL_ERROR", "服务器处理失败，请稍后重试", request),
    },
    { status: 500 },
  )
}
