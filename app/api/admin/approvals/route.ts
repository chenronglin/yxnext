import { type NextRequest } from "next/server"

import { listApprovalRequests } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 作者审批读取用户审批状态，固定走 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listApprovalRequests(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
