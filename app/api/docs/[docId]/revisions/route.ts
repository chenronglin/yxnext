import { type NextRequest } from "next/server"

import { listDocRevisions } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Revision 历史列表直接从 MySQL 读取，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type DocRevisionsRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function GET(request: NextRequest, context: DocRevisionsRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const result = await listDocRevisions(actor, docId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
