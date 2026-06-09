import { type NextRequest } from "next/server"

import { docApproveSchema } from "@/server/modules/doc/doc.schemas"
import { approveDoc } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Doc 审核通过会同时推进项目阶段和关闭待办，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type ApproveDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function POST(request: NextRequest, context: ApproveDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const body = docApproveSchema.parse(await request.json().catch(() => ({})))
    const result = await approveDoc(actor, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
