import { type NextRequest } from "next/server"

import { markNotificationRead } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 单条通知已读只会修改当前用户自己的通知记录，因此使用 recipient_user_id 做最终约束。
export const runtime = "nodejs"

type NotificationReadRouteContext = {
  params: Promise<{
    notificationId: string
  }>
}

export async function POST(request: NextRequest, context: NotificationReadRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { notificationId } = await context.params
    const result = await markNotificationRead(actor, notificationId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
