import { type NextRequest } from "next/server"

import { docWithdrawSchema } from "@/server/modules/doc/doc.schemas"
import { getDocWorkflowState, withdrawDoc } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"
type RouteContext = { params: Promise<{ docId: string }> }

// 编辑与作者共用轻量状态查询；查询本身不代表开始审核，也不会改变撤回资格。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    return ok(await getDocWorkflowState(actor, docId), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return fail(error, request)
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const input = docWithdrawSchema.parse(await request.json().catch(() => ({})))
    return ok(await withdrawDoc(actor, docId, input))
  } catch (error) {
    return fail(error, request)
  }
}
