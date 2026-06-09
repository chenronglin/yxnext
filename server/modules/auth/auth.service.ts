import "server-only"

import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"

import { createUserSession, toCurrentUser } from "@/server/auth/session"
import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import type { CurrentUser, UserStatus } from "@/types/domain"
import type { RegisterAccountResult } from "@/types/account"

type LoginInput = {
  account: string
  password: string
}

type LoginResult = {
  currentUser: CurrentUser
  sessionId: string
  expiresAt: Date
}

type RegisterInput = {
  username: string
  name: string
  role: "author" | "editor"
  email: string
  phone?: string | null
  biography?: string | null
  password: string
}

type TxClient = Prisma.TransactionClient

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

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function userName(user: { username: string; displayName: string | null }) {
  // 忘记密码通知和注册审批待办都需要统一的人名展示口径：
  // 优先展示用户设置过的 displayName，没有时再回退到 username。
  return user.displayName ?? user.username
}

function makeApprovalTodoOpenKey(userId: bigint, adminUserId: bigint) {
  // 一个注册申请会同步发给所有管理员，因此 open_dedupe_key 必须带上管理员 ID，
  // 否则 todo_items.open_dedupe_key 的唯一约束会在多管理员场景下冲突。
  return `register_approval:${userId.toString()}:${adminUserId.toString()}`
}

async function createRegisterApprovalNotifications(
  tx: TxClient,
  input: {
    applicantUserId: bigint
    applicantName: string
  },
) {
  // 注册申请需要同时进入管理员的“通知 + 待办”双通道：
  // 通知负责事件告知，待办负责审批闭环。
  const admins = await tx.user.findMany({
    where: {
      role: "admin",
      status: "active",
    },
    select: {
      userId: true,
    },
  })

  if (admins.length === 0) {
    return
  }

  await tx.notification.createMany({
    data: admins.map((admin) => ({
      recipientUserId: admin.userId,
      type: "register_pending_approval",
      title: "新的注册申请待审批",
      body: `用户「${input.applicantName}」提交了注册申请，请及时审批。`,
      entityType: "user",
      entityId: input.applicantUserId,
    })),
  })

  await tx.todoItem.createMany({
    data: admins.map((admin) => ({
      recipientUserId: admin.userId,
      todoType: "register_approval",
      title: `注册申请待审批：${input.applicantName}`,
      description: `用户「${input.applicantName}」提交了注册申请，请前往作者审批页处理。`,
      entityType: "user",
      entityId: input.applicantUserId,
      status: "open",
      isRead: false,
      readAt: null,
      dedupeKey: `register_approval:${input.applicantUserId.toString()}`,
      openDedupeKey: makeApprovalTodoOpenKey(input.applicantUserId, admin.userId),
    })),
  })
}

async function createForgotPasswordNotifications(
  tx: TxClient,
  input: {
    userId: bigint
    applicantName: string
  },
) {
  // 忘记密码按照最新业务规则只通知管理员，不进入待办；
  // 同时统一使用固定文案，避免不同页面或接口写出多套说法。
  const admins = await tx.user.findMany({
    where: {
      role: "admin",
      status: "active",
    },
    select: {
      userId: true,
    },
  })

  if (admins.length === 0) {
    return
  }

  await tx.notification.createMany({
    data: admins.map((admin) => ({
      recipientUserId: admin.userId,
      type: "forgot_password_requested",
      title: "收到忘记密码申请",
      body: `${input.applicantName}用户忘记密码，请帮忙重置`,
      entityType: "user",
      entityId: input.userId,
    })),
  })
}

// 注册申请遵守当前数据库结构：
// 1. email 是必填且唯一字段，因此这里只支持“带邮箱”的申请；
// 2. status 默认写 pending，后续由管理员审批接口推进到 active/rejected。
export async function registerPendingUser(input: RegisterInput): Promise<RegisterAccountResult> {
  const username = input.username.trim()
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const phone = trimToNull(input.phone ?? null)
  const biography = trimToNull(input.biography ?? null)

  if (!username || !name || !email || !input.password) {
    throw new ApiError({
      status: 400,
      code: "REGISTER_FIELDS_REQUIRED",
      message: "注册信息不完整，请补全账号、笔名、邮箱和密码",
    })
  }

  if (input.password.length < 6) {
    throw new ApiError({
      status: 400,
      code: "REGISTER_PASSWORD_TOO_SHORT",
      message: "密码长度不能少于 6 位",
    })
  }

  const [usernameExists, emailExists] = await Promise.all([
    prisma.user.findFirst({
      where: {
        username,
      },
      select: {
        userId: true,
      },
    }),
    prisma.user.findFirst({
      where: {
        email,
      },
      select: {
        userId: true,
      },
    }),
  ])

  if (usernameExists) {
    throw new ApiError({
      status: 409,
      code: "REGISTER_USERNAME_CONFLICT",
      message: "该用户名已被使用",
    })
  }

  if (emailExists) {
    throw new ApiError({
      status: 409,
      code: "REGISTER_EMAIL_CONFLICT",
      message: "该邮箱已被使用",
    })
  }

  const passwordHash = await bcrypt.hash(input.password, 10)

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        username,
        displayName: name,
        role: input.role,
        email,
        phone,
        biography,
        passwordHash,
        status: "pending",
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
      },
    })

    await tx.operationLog.create({
      data: {
        actorUserId: createdUser.userId,
        actorRole: input.role,
        action: "auth.register",
        entityType: "user",
        entityId: createdUser.userId,
        afterJson: {
          role: input.role,
          status: createdUser.status,
          biography,
        },
      },
    })

    await createRegisterApprovalNotifications(tx, {
      applicantUserId: createdUser.userId,
      applicantName: userName(createdUser),
    })

    return createdUser
  })

  return {
    userId: user.userId.toString(),
    status: user.status,
  }
}

export async function requestPasswordResetByEmail(emailValue: string) {
  const email = emailValue.trim().toLowerCase()

  if (!email) {
    throw new ApiError({
      status: 400,
      code: "FORGOT_PASSWORD_EMAIL_REQUIRED",
      message: "邮箱不能为空",
    })
  }

  // 这里始终返回统一成功结果，避免接口通过 404/409 泄露邮箱是否存在。
  const user = await prisma.user.findFirst({
    where: {
      email,
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  })

  if (user) {
    await prisma.$transaction(async (tx) => {
      await createForgotPasswordNotifications(tx, {
        userId: user.userId,
        applicantName: userName(user),
      })

      await tx.operationLog.create({
        data: {
          actorUserId: user.userId,
          action: "auth.forgot_password.request",
          actorRole: null,
          entityType: "user",
          entityId: user.userId,
          afterJson: {
            email,
          },
        },
      })
    })
  }

  return {
    ok: true,
  }
}
