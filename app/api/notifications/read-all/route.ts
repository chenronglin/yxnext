import { type NextRequest } from "next/server"

import { markAllNotificationsRead } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 全部已读是批量更新当前用户通知状态的动作，因此单独拆成集合级路由。
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await markAllNotificationsRead(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
