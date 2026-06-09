import { type NextRequest } from "next/server"
import { z } from "zod"

import { requestPasswordResetByEmail } from "@/server/modules/auth/auth.service"
import { fail, ok } from "@/server/shared/api-response"

// 忘记密码请求会查询用户并可能写管理员通知，因此必须固定在 Node.js runtime。
export const runtime = "nodejs"

const forgotPasswordSchema = z.object({
  // 这里仍然校验邮箱格式，但后端最终返回始终保持统一成功响应，避免泄露账号存在性。
  email: z.string().trim().email("请输入有效的邮箱地址"),
})

export async function POST(request: NextRequest) {
  try {
    const body = forgotPasswordSchema.parse(await request.json().catch(() => ({})))
    const result = await requestPasswordResetByEmail(body.email)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
