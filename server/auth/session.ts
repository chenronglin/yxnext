import "server-only"

import { randomBytes } from "crypto"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

import { prisma } from "@/server/db/prisma"
import type { CurrentUser } from "@/types/domain"

// Session cookie 只保存数据库会话 ID，不保存用户资料，避免前端可读存储成为权限真相源。
export const SESSION_COOKIE_NAME = "yx_session"

// 第一阶段先采用 7 天固定有效期；后续如果要做“记住我”或短会话，可以在这里集中调整。
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

// 会话 ID 使用 32 字节随机数转 64 位 hex，刚好匹配 user_sessions.session_id 的 CHAR(64) 设计。
const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/

type SessionUserRecord = {
  userId: bigint
  username: string
  email: string
  passwordResetRequired: boolean
  role: CurrentUser["role"]
  status: CurrentUser["status"]
  displayName: string | null
  phone: string | null
  avatarUrl: string | null
}

type SessionWriter = {
  userSession: {
    create: typeof prisma.userSession.create
    updateMany: typeof prisma.userSession.updateMany
  }
}

// 所有接口统一返回 CurrentUser，避免页面层直接依赖 Prisma 字段命名和 BigInt 类型。
export function toCurrentUser(user: SessionUserRecord): CurrentUser {
  return {
    id: user.userId.toString(),
    username: user.username,
    name: user.displayName ?? user.username,
    role: user.role,
    status: user.status,
    email: user.email,
    phone: user.phone ?? undefined,
    passwordResetRequired: user.passwordResetRequired,
  }
}

// 生成并落库一个新的不透明 session；可接收事务 client，保证登录相关写入能原子提交。
export async function createUserSession(userId: bigint, client: SessionWriter = prisma) {
  const sessionId = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

  await client.userSession.create({
    data: {
      sessionId,
      userId,
      expiresAt,
    },
  })

  return { sessionId, expiresAt }
}

// Cookie 写入集中在这里，确保 login/logout/me 之外的后续接口不会各自拼配置。
export function setSessionCookie(response: NextResponse, sessionId: string, expiresAt: Date) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
}

// 清理 cookie 时同时覆盖 path，确保浏览器能删除登录时写入的同名 cookie。
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}

// 先做格式校验，避免明显无效的 cookie 值进入数据库查询路径。
export function isSessionId(value: string | undefined | null): value is string {
  return Boolean(value && SESSION_ID_PATTERN.test(value))
}

// 根据 session id 读取当前用户；这里只承认未过期、未撤销、且用户状态 active 的会话。
export async function getCurrentUserBySessionId(sessionId: string | undefined | null) {
  if (!isSessionId(sessionId)) {
    return null
  }

  const session = await prisma.userSession.findFirst({
    where: {
      sessionId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
      user: {
        status: "active",
      },
    },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
          email: true,
          passwordResetRequired: true,
          role: true,
          status: true,
          displayName: true,
          phone: true,
          avatarUrl: true,
        },
      },
    },
  })

  return session ? toCurrentUser(session.user) : null
}

// 服务端组件和布局使用这个函数读取当前请求的 cookie，并保持 currentUser 的唯一来源是数据库 session。
export async function getCurrentUser() {
  const cookieStore = await cookies()
  return getCurrentUserBySessionId(cookieStore.get(SESSION_COOKIE_NAME)?.value)
}

// 退出登录采用软撤销，保留 session 记录用于后续审计和异常登录排查。
export async function revokeUserSession(sessionId: string | undefined | null) {
  if (!isSessionId(sessionId)) {
    return
  }

  await prisma.userSession.updateMany({
    where: {
      sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })
}

// 按用户批量撤销全部活动会话，用于禁用账号、修改密码、管理员重置密码等高风险场景。
// 这里故意只更新 `revokedAt IS NULL` 的活动会话，既避免重复写放大，也保留历史审计轨迹。
export async function revokeAllUserSessionsByUserId(userId: bigint, client: SessionWriter = prisma) {
  await client.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })
}
