import "server-only"

import type { NextRequest } from "next/server"

import { getCurrentUser, getCurrentUserBySessionId, SESSION_COOKIE_NAME } from "@/server/auth/session"
import { ApiError } from "@/server/shared/api-response"
import type { CurrentUser, Role } from "@/types/domain"

export type ApiCurrentUser = CurrentUser & {
  userId: bigint
}

// Server Component 和 Route Handler 都需要同一套 actor 结构，这里集中做一次转换。
export function toApiCurrentUser(currentUser: CurrentUser): ApiCurrentUser {
  return {
    ...currentUser,
    userId: BigInt(currentUser.id),
  }
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

  return toApiCurrentUser(currentUser)
}

// Server Component 直接读取当前请求上下文里的 session，避免为了取数据再绕一次 HTTP。
export async function requireServerCurrentUser(): Promise<ApiCurrentUser> {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    throw new ApiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "未登录或登录已过期",
    })
  }

  return toApiCurrentUser(currentUser)
}

// 需要特定角色的模块统一在这里做角色断言，避免各 service 重复拼 403 错误。
export function assertRole(actor: ApiCurrentUser, roles: Role[]) {
  if (roles.includes(actor.role)) {
    return
  }

  throw new ApiError({
    status: 403,
    code: "FORBIDDEN",
    message: "无权访问该资源",
  })
}
