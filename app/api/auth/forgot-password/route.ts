import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createPublicRateLimitContext,
  getPublicRateLimitStatus,
  PUBLIC_FORGOT_PASSWORD_RATE_LIMIT,
  recordPublicRateLimitHit,
} from "@/server/auth/login-rate-limit"
import { requestPasswordResetByEmail } from "@/server/modules/auth/auth.service"
import { fail, ok } from "@/server/shared/api-response"

// 忘记密码请求会查询用户并可能写管理员通知，因此必须固定在 Node.js runtime。
export const runtime = "nodejs"

const forgotPasswordSchema = z.object({
  // 这里仍然校验邮箱格式，但后端最终返回始终保持统一成功响应，避免泄露账号存在性。
  email: z.string().trim().email("请输入有效的邮箱地址"),
})

export async function POST(request: NextRequest) {
  const rateLimitContext = createPublicRateLimitContext({
    scope: "forgot-password",
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
  })
  const rateLimitStatus = getPublicRateLimitStatus(rateLimitContext, PUBLIC_FORGOT_PASSWORD_RATE_LIMIT)

  // 忘记密码不能透露账号存在性，但同样需要先限流，避免被用于批量刷管理员通知。
  if (rateLimitStatus.limited) {
    return NextResponse.json(
      {
        ok: false,
        code: "FORGOT_PASSWORD_RATE_LIMITED",
        message: "找回密码请求过于频繁，请稍后再试",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitStatus.retryAfterSeconds),
        },
      },
    )
  }

  recordPublicRateLimitHit(rateLimitContext)

  try {
    const body = forgotPasswordSchema.parse(await request.json().catch(() => ({})))
    const result = await requestPasswordResetByEmail(body.email)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
