import { type NextRequest } from "next/server"

import { getDocRevisionDetail } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Revision 详情读取完整快照内容，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type DocRevisionDetailRouteContext = {
  params: Promise<{
    docId: string
    revisionId: string
  }>
}

export async function GET(request: NextRequest, context: DocRevisionDetailRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId, revisionId } = await context.params
    const result = await getDocRevisionDetail(actor, docId, revisionId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
