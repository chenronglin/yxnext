import "server-only"

import type { NextRequest } from "next/server"

import { getCurrentUserBySessionId, SESSION_COOKIE_NAME } from "@/server/auth/session"
import { ApiError } from "@/server/shared/api-response"
import type { CurrentUser } from "@/types/domain"

export type ApiCurrentUser = CurrentUser & {
  userId: bigint
}

// Route Handler 统一从 session cookie 读取当前用户；前端传 userId 不参与鉴权判断。
export async function requireApiCurrentUser(request: NextRequest): Promise<ApiCurrentUser> {
  const currentUser = await getCurrentUserBySessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  if (!currentUser) {
    throw new ApiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "未登录或登录已过期",
    })
  }

  return {
    ...currentUser,
    userId: BigInt(currentUser.id),
  }
}
