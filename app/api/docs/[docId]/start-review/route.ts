import { type NextRequest } from "next/server"

import { docStartReviewSchema } from "@/server/modules/doc/doc.schemas"
import { startDocReview } from "@/server/modules/doc/doc.service"
import { requireApiCurrentUser } from "@/server/shared/current-user"
import { fail, ok } from "@/server/shared/api-response"

export const runtime = "nodejs"
type RouteContext = { params: Promise<{ docId: string }> }

// 只有明确的写操作才开始审核；打开页面、查看通知或读取正文都不改变作者撤回权。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const input = docStartReviewSchema.parse(await request.json().catch(() => ({})))
    return ok(await startDocReview(actor, docId, input))
  } catch (error) {
    return fail(error, request)
  }
}
