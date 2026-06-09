import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateManagedUser } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 用户编辑会落库，继续固定 Node.js runtime。
export const runtime = "nodejs"

const managedUserSchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  role: z.enum(["admin", "editor", "author"]).optional(),
  email: z.string().optional(),
  phone: z.string().optional().nullable(),
  // 用户治理编辑和创建保持同一字段集，避免 biography 在不同入口缺失。
  biography: z.string().optional().nullable(),
  password: z.string().optional(),
})

type UserRouteContext = {
  params: Promise<{
    userId: string
  }>
}

export async function PATCH(request: NextRequest, context: UserRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { userId } = await context.params
    const body = managedUserSchema.parse(await request.json().catch(() => ({})))
    const result = await updateManagedUser(actor, userId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
