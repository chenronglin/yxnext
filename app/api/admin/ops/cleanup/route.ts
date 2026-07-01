import { type NextRequest } from "next/server"
import { z } from "zod"

import { cleanupOpsData } from "@/server/modules/admin/ops.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 数据库清理会删除过期运行数据，必须固定在 Node.js runtime 并走管理员鉴权。
export const runtime = "nodejs"

const cleanupSchema = z.object({
  // 保留天数在服务层仍会二次收口；路由层先保证请求体是数字，避免脏值穿透到业务层。
  readNotificationDays: z.number().int().min(7).max(3650).optional(),
  closedTodoDays: z.number().int().min(7).max(3650).optional(),
  exportJobDays: z.number().int().min(7).max(3650).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = await request.json().catch(() => ({}))
    const input = cleanupSchema.parse(body)
    const result = await cleanupOpsData(actor, input)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
