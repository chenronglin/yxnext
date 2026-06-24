import { type NextRequest } from "next/server"

import { getCurrentDocView } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Doc 当前稿件读取依赖 Prisma/MySQL，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type CurrentDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function GET(request: NextRequest, context: CurrentDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const result = await getCurrentDocView(actor, docId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
