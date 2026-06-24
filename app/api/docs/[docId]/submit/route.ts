import { type NextRequest } from "next/server"

import { docSubmitSchema } from "@/server/modules/doc/doc.schemas"
import { submitDoc } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Doc 提交审核包含封存草稿、创建 Revision、切换持有人，必须在 Node.js runtime 中执行。
export const runtime = "nodejs"

type SubmitDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function POST(request: NextRequest, context: SubmitDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const body = docSubmitSchema.parse(await request.json().catch(() => ({})))
    const result = await submitDoc(actor, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
