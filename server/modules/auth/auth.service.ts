import "server-only"

import bcrypt from "bcryptjs"

import { createUserSession, toCurrentUser } from "@/server/auth/session"
import { prisma } from "@/server/db/prisma"
import type { CurrentUser, UserStatus } from "@/types/domain"

type LoginInput = {
  account: string
  password: string
}

type LoginResult = {
  currentUser: CurrentUser
  sessionId: string
  expiresAt: Date
}

// 登录失败原因会映射成稳定的 HTTP 状态码和前端提示，不把数据库异常直接暴露给页面。
export class AuthServiceError extends Error {
  constructor(
    public readonly code: "INVALID_CREDENTIALS" | "ACCOUNT_NOT_ACTIVE",
    message: string,
    public readonly userStatus?: UserStatus,
  ) {
    super(message)
    this.name = "AuthServiceError"
  }
}

// 第 1 阶段登录支持用户名或邮箱，保持登录页“账号”字段的产品口径。
export async function loginWithPassword(input: LoginInput): Promise<LoginResult> {
  const account = input.account.trim()

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: account }, { email: account }],
    },
    select: {
      userId: true,
      username: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
      displayName: true,
      phone: true,
      avatarUrl: true,
    },
  })

  if (!user) {
    throw new AuthServiceError("INVALID_CREDENTIALS", "账号或密码错误")
  }

  // 密码只通过 bcrypt 校验；数据库里必须保存 password_hash，不能在业务代码里兼容明文密码。
  const passwordMatched = await bcrypt.compare(input.password, user.passwordHash)
  if (!passwordMatched) {
    throw new AuthServiceError("INVALID_CREDENTIALS", "账号或密码错误")
  }

  // 非 active 用户不创建 session，前端根据状态跳转到统一账号状态页。
  if (user.status !== "active") {
    throw new AuthServiceError("ACCOUNT_NOT_ACTIVE", "账号当前不可登录", user.status)
  }

  const { sessionId, expiresAt } = await prisma.$transaction(async (tx) => {
    const session = await createUserSession(user.userId, tx)

    // last_login_at 不参与权限判断，只用于用户管理和审计展示；和 session 创建放在同一事务里。
    await tx.user.update({
      where: {
        userId: user.userId,
      },
      data: {
        lastLoginAt: new Date(),
      },
    })

    return session
  })

  return {
    currentUser: toCurrentUser(user),
    sessionId,
    expiresAt,
  }
}
