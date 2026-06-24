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
  // 个人简介现在已经有真实库表字段，对外接口允许直接读写。
  biography: z.string().trim().nullable().optional(),
  avatarUrl: z.string().trim().url("头像地址格式不正确").nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    // 强制改密后的设置页仍需要读取当前用户资料，因此这里显式放行。
    const actor = await requireApiCurrentUser(request, { allowPasswordResetRequired: true })
    const result = await getAccountProfile(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 为了避免“尚未改密时顺手改资料”扩大流程范围，PATCH 仍然维持统一拦截。
    const actor = await requireApiCurrentUser(request)
    const body = updateProfileSchema.parse(await request.json().catch(() => ({})))
    const result = await updateAccountProfile(actor, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
