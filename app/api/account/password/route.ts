import { type NextRequest } from "next/server"
import { z } from "zod"

import { changeAccountPassword } from "@/server/modules/account/account.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 修改密码会校验旧密码并更新 password_hash，因此必须固定在 Node.js runtime 中执行。
export const runtime = "nodejs"

const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "请输入旧密码"),
    newPassword: z.string().min(6, "新密码长度不能少于 6 位"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致",
      })
    }
  })

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = changePasswordSchema.parse(await request.json().catch(() => ({})))
    const result = await changeAccountPassword(actor, {
      oldPassword: body.oldPassword,
      newPassword: body.newPassword,
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
