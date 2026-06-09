import { type NextRequest } from "next/server"
import { z } from "zod"

import { registerPendingUser } from "@/server/modules/auth/auth.service"
import { fail, ok, ApiError } from "@/server/shared/api-response"

// 注册申请会写入 users 和审计日志，依赖 bcrypt 与 Prisma，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

const registerSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名"),
  password: z.string().min(6, "密码长度不能少于 6 位"),
  confirmPassword: z.string().min(1, "请再次输入密码"),
  role: z.enum(["author", "editor"]),
  penName: z.string().trim().min(1, "请输入笔名或姓名").optional(),
  name: z.string().trim().min(1, "请输入笔名或姓名").optional(),
  email: z.string().trim().email("请输入有效的邮箱地址").optional(),
  phone: z.string().trim().optional(),
  contact: z.string().trim().optional(),
  bio: z.string().trim().optional(),
})

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isPhone(value: string) {
  return /^1\d{10}$/.test(value)
}

export async function POST(request: NextRequest) {
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
    const rawContact = body.contact?.trim() ?? ""
    const email = body.email ?? (isEmail(rawContact) ? rawContact : "")
    const phone = body.phone ?? (isPhone(rawContact) ? rawContact : undefined)

    // 当前数据库设计要求 email 非空且唯一，因此这里只实现“带邮箱的注册申请”；
    // bio 字段当前库表无落点，接口层暂时只接受但不持久化，避免违反现有表结构。
    if (!email) {
      throw new ApiError({
        status: 409,
        code: "REGISTER_EMAIL_REQUIRED_BY_SCHEMA",
        message: "当前数据库设计要求注册必须提供邮箱，暂不支持仅手机号申请",
      })
    }

    const result = await registerPendingUser({
      username: body.username,
      password: body.password,
      role: body.role,
      name,
      email,
      phone,
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
