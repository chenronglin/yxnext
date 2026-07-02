import { type NextRequest } from "next/server"

import { docCancelApprovalSchema } from "@/server/modules/doc/doc.schemas"
import { cancelDocApproval } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 取消定稿会重新创建作者活跃草稿并写待办/通知，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type CancelApprovalDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function POST(request: NextRequest, context: CancelApprovalDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const body = docCancelApprovalSchema.parse(await request.json().catch(() => ({})))
    const result = await cancelDocApproval(actor, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
