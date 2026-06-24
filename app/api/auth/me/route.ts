import { NextResponse, type NextRequest } from "next/server"

import {
  clearSessionCookie,
  getCurrentUserBySessionId,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session"
import { ApiError, fail } from "@/server/shared/api-response"

// currentUser 读取依赖 Prisma，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUserBySessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  if (!currentUser) {
    const response = fail(
      new ApiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "未登录或登录已过期",
      }),
      request,
    )

    // session 不存在或已失效时顺手清 cookie，避免前端持续携带无效凭据。
    clearSessionCookie(response)

    return response
  }

  return NextResponse.json({ currentUser })
}
