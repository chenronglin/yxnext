import { type NextRequest } from "next/server"
import { z } from "zod"

import { getAccountProfile, updateAccountProfile } from "@/server/modules/account/account.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 个人资料接口只操作当前登录用户自己的记录，因此固定走 Node.js runtime。
export const runtime = "nodejs"

const updateProfileSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email("请输入有效的邮箱地址").optional(),
  phone: z.string().trim().nullable().optional(),
  avatarUrl: z.string().trim().url("头像地址格式不正确").nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await getAccountProfile(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = updateProfileSchema.parse(await request.json().catch(() => ({})))
    const result = await updateAccountProfile(actor, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
