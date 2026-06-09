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
  // 注册页现在统一只接受邮箱，手机号不再作为注册入口字段。
  email: z.string().trim().email("请输入有效的邮箱地址"),
  bio: z.string().trim().optional(),
})

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

    const result = await registerPendingUser({
      username: body.username,
      password: body.password,
      role: body.role,
      name,
      email: body.email,
      biography: body.bio,
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
