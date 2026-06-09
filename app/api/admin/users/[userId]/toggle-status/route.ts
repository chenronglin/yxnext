import { type NextRequest } from "next/server"

import { toggleManagedUserStatus } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 启停用户需要写用户状态和通知，固定使用 Node.js runtime。
export const runtime = "nodejs"

type ToggleStatusRouteContext = {
  params: Promise<{
    userId: string
  }>
}

export async function POST(request: NextRequest, context: ToggleStatusRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { userId } = await context.params
    const result = await toggleManagedUserStatus(actor, userId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
