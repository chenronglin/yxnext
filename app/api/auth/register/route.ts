import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createPublicRateLimitContext,
  getPublicRateLimitStatus,
  PUBLIC_REGISTER_RATE_LIMIT,
  recordPublicRateLimitHit,
} from "@/server/auth/login-rate-limit"
import { registerPendingUser } from "@/server/modules/auth/auth.service"
import { fail, ok, ApiError } from "@/server/shared/api-response"

// 注册申请会写入 users 和审计日志，依赖 bcrypt 与 Prisma，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

const registerSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(6, "密码长度不能少于 6 位"),
  confirmPassword: z.string().min(1, "请再次输入密码"),
  penName: z.string().trim().min(1, "请输入笔名或姓名").optional(),
  name: z.string().trim().min(1, "请输入笔名或姓名").optional(),
  // 注册页现在统一只接受邮箱，手机号不再作为注册入口字段。
  email: z.string().trim().email("请输入有效的邮箱地址"),
  bio: z.string().trim().optional(),
})

export async function POST(request: NextRequest) {
  const rateLimitContext = createPublicRateLimitContext({
    scope: "register",
    forwardedFor: request.headers.get("x-forwarded-for"),
    realIp: request.headers.get("x-real-ip"),
  })
  const rateLimitStatus = getPublicRateLimitStatus(rateLimitContext, PUBLIC_REGISTER_RATE_LIMIT)

  // 注册是公网入口，限流必须发生在解析和写库之前，避免垃圾注册请求消耗数据库资源。
  if (rateLimitStatus.limited) {
    return NextResponse.json(
      {
        ok: false,
        code: "REGISTER_RATE_LIMITED",
        message: "注册申请提交过于频繁，请稍后再试",
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
    const body = registerSchema.parse(await request.json().catch(() => ({})))

    if (body.password !== body.confirmPassword) {
      throw new ApiError({
        status: 400,
        code: "REGISTER_PASSWORD_MISMATCH",
        message: "两次输入的密码不一致",
      })
    }

    const name = body.name ?? body.penName ?? ""

    const result = await registerPendingUser({
      username: body.username,
      password: body.password,
      name,
      email: body.email,
      biography: body.bio,
    })

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
