import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "@/lib/i18n/config"
import { clearLoginRateLimit, createLoginRateLimitContext, getLoginRateLimitStatus, recordFailedLoginAttempt } from "@/server/auth/login-rate-limit"
import { setSessionCookie } from "@/server/auth/session"
import { AuthServiceError, loginWithPassword } from "@/server/modules/auth/auth.service"
import { ApiError, fail } from "@/server/shared/api-response"

// 登录依赖 Prisma、bcrypt 和 Node crypto，必须固定在 Node.js runtime。
export const runtime = "nodejs"

const loginSchema = z.object({
  account: z.string().trim().min(1, "请输入账号"),
  password: z.string().min(1, "请输入密码"),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return fail(
      new ApiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "登录参数不完整",
      }),
      request,
    )
  }

  const rateLimitContext = createLoginRateLimitContext({
    account: parsed.data.account,
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
  })
  const rateLimitStatus = getLoginRateLimitStatus(rateLimitContext)

  // 限流检查必须发生在真正查库之前，避免攻击者先把数据库和 bcrypt 资源吃满，再收到 429。
  if (rateLimitStatus.limited) {
    return fail(
      new ApiError({
        status: 429,
        code: "LOGIN_RATE_LIMITED",
        message: "登录尝试过于频繁，请稍后再试",
      }),
      request,
    )
  }

  try {
    const { currentUser, sessionId, expiresAt } = await loginWithPassword(parsed.data)
    const response = NextResponse.json({ currentUser })

    // 只有账号密码和账号状态都通过后才写入 httpOnly cookie。
    setSessionCookie(response, sessionId, expiresAt)
    // 登录成功后把用户偏好语言同步到普通 Cookie，后续 API 错误无需额外查库也能按同一语言返回。
    response.cookies.set({
      name: LOCALE_COOKIE_NAME,
      value: currentUser.preferredLocale,
      sameSite: "lax",
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    })
    clearLoginRateLimit(rateLimitContext)

    return response
  } catch (error) {
    if (error instanceof AuthServiceError) {
      // 对外统一返回同一条失败信息，避免通过状态码或返回体细节枚举账号是否存在、是否待审批、是否被禁用。
      recordFailedLoginAttempt(rateLimitContext)

      return fail(
        new ApiError({
          status: 401,
          code: "INVALID_CREDENTIALS",
          message: "账号或密码错误",
        }),
        request,
      )
    }

    return fail(
      new ApiError({
        status: 500,
        code: "LOGIN_FAILED",
        message: "登录失败，请稍后重试",
      }),
      request,
    )
  }
}
