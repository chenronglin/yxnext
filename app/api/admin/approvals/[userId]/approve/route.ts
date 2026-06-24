import { type NextRequest } from "next/server"

import { approveApprovalRequest } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 审批通过会更新用户状态并发通知，固定使用 Node.js runtime。
export const runtime = "nodejs"

type ApproveRouteContext = {
  params: Promise<{
    userId: string
  }>
}

export async function POST(request: NextRequest, context: ApproveRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { userId } = await context.params
    const result = await approveApprovalRequest(actor, userId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
