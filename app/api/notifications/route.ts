import { type NextRequest } from "next/server"

import { listNotifications } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 通知中心基于 recipient_user_id 聚合读取，因此固定运行在 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listNotifications(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
