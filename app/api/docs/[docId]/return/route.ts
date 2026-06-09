import { type NextRequest } from "next/server"

import { docReturnSchema } from "@/server/modules/doc/doc.schemas"
import { returnDocToAuthor } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Doc 退回动作会切换持有人并写待办/通知，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type ReturnDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function POST(request: NextRequest, context: ReturnDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const body = docReturnSchema.parse(await request.json().catch(() => ({})))
    const result = await returnDocToAuthor(actor, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
