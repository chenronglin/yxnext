import { type NextRequest } from "next/server"

import { archiveStoryIdea } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// SI 归档会直接修改主记录状态并写审计日志，因此固定运行在 Node.js runtime。
export const runtime = "nodejs"

type ArchiveRouteContext = {
  params: Promise<{
    siId: string
  }>
}

export async function POST(request: NextRequest, context: ArchiveRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const result = await archiveStoryIdea(actor, siId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
