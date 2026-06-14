import "server-only"

import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"

import { revokeAllUserSessionsByUserId } from "@/server/auth/session"
import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import { translateUniqueConstraintError } from "@/server/shared/invariant-keys"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { AccountBindingInfo, AccountProfile } from "@/types/account"

type TxClient = Prisma.TransactionClient

type UpdateAccountProfileInput = {
  name?: string
  email?: string
  phone?: string | null
  biography?: string | null
  avatarUrl?: string | null
}

type ChangePasswordInput = {
  oldPassword: string
  newPassword: string
}

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function toAccountProfile(user: {
  userId: bigint
  username: string
  displayName: string | null
  role: "admin" | "editor" | "author"
  status: "active" | "disabled" | "pending" | "rejected"
  email: string
  phone: string | null
  biography: string | null
  avatarUrl: string | null
}): AccountProfile {
  return {
    id: user.userId.toString(),
    username: user.username,
    name: user.displayName ?? user.username,
    role: user.role,
    status: user.status,
    email: user.email,
    phone: user.phone,
    biography: user.biography,
    avatarUrl: user.avatarUrl,
  }
}

async function writeOperationLog(
  tx: TxClient,
  input: {
    actor: ApiCurrentUser
    action: string
    entityId: bigint
    beforeJson?: Prisma.InputJsonValue
    afterJson?: Prisma.InputJsonValue
    metadataJson?: Prisma.InputJsonValue
  },
) {
  await tx.operationLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      action: input.action,
      entityType: "user",
      entityId: input.entityId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      metadataJson: input.metadataJson,
    },
  })
}

export async function getAccountProfile(actor: ApiCurrentUser) {
  const user = await prisma.user.findUnique({
    where: {
      userId: actor.userId,
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      email: true,
      phone: true,
      biography: true,
      avatarUrl: true,
    },
  })

  if (!user) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "当前用户不存在",
    })
  }

  return {
    profile: toAccountProfile(user),
  }
}

export async function updateAccountProfile(actor: ApiCurrentUser, input: UpdateAccountProfileInput) {
  const nextName = trimToNull(input.name)
  const nextEmail = trimToNull(input.email)
  const nextPhone = trimToNull(input.phone ?? null)
  const nextBiography = trimToNull(input.biography ?? null)
  const nextAvatarUrl = trimToNull(input.avatarUrl ?? null)

  const existing = await prisma.user.findUnique({
    where: {
      userId: actor.userId,
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
      email: true,
      phone: true,
      biography: true,
      avatarUrl: true,
      role: true,
      status: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "当前用户不存在",
    })
  }

  if (nextEmail && nextEmail !== existing.email) {
    const conflict = await prisma.user.findFirst({
      where: {
        email: nextEmail,
        userId: {
          not: actor.userId,
        },
      },
      select: {
        userId: true,
      },
    })

    if (conflict) {
      throw new ApiError({
        status: 409,
        code: "ACCOUNT_EMAIL_CONFLICT",
        message: "该邮箱已被其他账号使用",
      })
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          userId: actor.userId,
        },
        data: {
          displayName: nextName ?? existing.displayName,
          email: nextEmail ?? existing.email,
          phone: input.phone !== undefined ? nextPhone : existing.phone,
          biography: input.biography !== undefined ? nextBiography : existing.biography,
          avatarUrl: input.avatarUrl !== undefined ? nextAvatarUrl : existing.avatarUrl,
        },
      })

      await writeOperationLog(tx, {
        actor,
        action: "account.profile.update",
        entityId: actor.userId,
        beforeJson: {
          displayName: existing.displayName,
          email: existing.email,
          phone: existing.phone,
          biography: existing.biography,
          avatarUrl: existing.avatarUrl,
        },
        afterJson: {
          displayName: nextName ?? existing.displayName,
          email: nextEmail ?? existing.email,
          phone: input.phone !== undefined ? nextPhone : existing.phone,
          biography: input.biography !== undefined ? nextBiography : existing.biography,
          avatarUrl: input.avatarUrl !== undefined ? nextAvatarUrl : existing.avatarUrl,
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["email"],
          code: "ACCOUNT_EMAIL_CONFLICT",
          message: "该邮箱已被其他账号使用",
        },
      ]) ?? error
    )
  }

  return getAccountProfile(actor)
}

export async function changeAccountPassword(actor: ApiCurrentUser, input: ChangePasswordInput) {
  const oldPassword = input.oldPassword
  const newPassword = input.newPassword

  if (!oldPassword || !newPassword) {
    throw new ApiError({
      status: 400,
      code: "ACCOUNT_PASSWORD_REQUIRED",
      message: "旧密码和新密码都不能为空",
    })
  }

  if (newPassword.length < 6) {
    throw new ApiError({
      status: 400,
      code: "ACCOUNT_PASSWORD_TOO_SHORT",
      message: "新密码长度不能少于 6 位",
    })
  }

  const existing = await prisma.user.findUnique({
    where: {
      userId: actor.userId,
    },
    select: {
      userId: true,
      passwordHash: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "当前用户不存在",
    })
  }

  const passwordMatched = await bcrypt.compare(oldPassword, existing.passwordHash)
  if (!passwordMatched) {
    throw new ApiError({
      status: 400,
      code: "ACCOUNT_PASSWORD_OLD_INVALID",
      message: "旧密码不正确",
    })
  }

  const nextPasswordHash = await bcrypt.hash(newPassword, 10)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        userId: actor.userId,
      },
      data: {
        passwordHash: nextPasswordHash,
        // 一旦用户已经亲自完成改密，就要立刻清掉“强制改密”标记；
        // 否则后续重新登录仍会被系统持续拦截，形成无法退出的死循环。
        passwordResetRequired: false,
      },
    })

    // 用户主动修改密码后，需要让全部旧会话立刻失效。
    // 这样才能阻断已泄露设备、共享浏览器或旧 cookie 继续访问账户。
    await revokeAllUserSessionsByUserId(actor.userId, tx)

    await writeOperationLog(tx, {
      actor,
      action: "account.password.update",
      entityId: actor.userId,
      afterJson: {
        updated: true,
      },
      metadataJson: {
        sessionsRevoked: true,
      },
    })
  })

  return {
    ok: true,
    reauthRequired: true,
  }
}

export async function getAccountBindings(actor: ApiCurrentUser) {
  if (actor.role === "admin") {
    return {
      bindings: {
        role: actor.role,
        editors: [],
        authors: [],
        authorCount: 0,
        editorCount: 0,
      } satisfies AccountBindingInfo,
    }
  }

  if (actor.role === "author") {
    const bindings = await prisma.editorAuthorBinding.findMany({
      where: {
        authorId: actor.userId,
        status: "active",
      },
      include: {
        editor: {
          select: {
            userId: true,
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        boundAt: "asc",
      },
    })

    return {
      bindings: {
        role: actor.role,
        editors: bindings.map((binding) => ({
          id: binding.editor.userId.toString(),
          name: userName(binding.editor),
        })),
        authors: [],
        authorCount: 0,
        editorCount: bindings.length,
      } satisfies AccountBindingInfo,
    }
  }

  const bindings = await prisma.editorAuthorBinding.findMany({
    where: {
      editorId: actor.userId,
      status: "active",
    },
    include: {
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      boundAt: "asc",
    },
  })

  return {
    bindings: {
      role: actor.role,
      editors: [],
      authors: bindings.map((binding) => ({
        id: binding.author.userId.toString(),
        name: userName(binding.author),
      })),
      authorCount: bindings.length,
      editorCount: 0,
    } satisfies AccountBindingInfo,
  }
}
