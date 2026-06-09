import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { setSessionCookie } from "@/server/auth/session"
import { AuthServiceError, loginWithPassword } from "@/server/modules/auth/auth.service"

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
    return NextResponse.json(
      {
        message: parsed.error.issues[0]?.message ?? "登录参数不完整",
      },
      { status: 400 },
    )
  }

  try {
    const { currentUser, sessionId, expiresAt } = await loginWithPassword(parsed.data)
    const response = NextResponse.json({ currentUser })

    // 只有账号密码和账号状态都通过后才写入 httpOnly cookie。
    setSessionCookie(response, sessionId, expiresAt)

    return response
  } catch (error) {
    if (error instanceof AuthServiceError) {
      if (error.code === "ACCOUNT_NOT_ACTIVE") {
        return NextResponse.json(
          {
            message: error.message,
            status: error.userStatus,
          },
          { status: 403 },
        )
      }

      return NextResponse.json({ message: error.message }, { status: 401 })
    }

    return NextResponse.json({ message: "登录失败，请稍后重试" }, { status: 500 })
  }
}
